"""
Secondary analysis layer: GCP Speech-to-Text transcription + SEA-LION urgency analysis.

Activated when the primary deepfake detector is uncertain (score 0.3 – 0.7).
Uses a service account JSON key file for GCP auth — no gcloud CLI or ADC needed.
"""
from __future__ import annotations

import json
import time

from google.cloud import speech_v1
from google.oauth2 import service_account
from openai import OpenAI

from app.config import settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

URGENCY_SYSTEM_PROMPT = """You are an urgency classifier for phone calls in a Southeast Asian context.
Analyze the transcript for indicators of scam calls, phishing, social engineering, threats, coercion,
financial fraud, impersonation of officials, or any high-pressure manipulation tactics common in the region.

You MUST respond with ONLY a valid JSON object, no other text:
{"urgency_level": "low|medium|high|critical", "confidence_score": 0.0-1.0, "reasoning": "brief explanation"}

Scoring guide:
- low (0.0-0.25): Normal conversation, no urgency indicators
- medium (0.25-0.5): Some suspicious patterns but inconclusive
- high (0.5-0.75): Strong indicators of scam/manipulation
- critical (0.75-1.0): Active threat, immediate danger, or clear scam attempt"""

# Lazily initialized GCP Speech client
_speech_client: speech_v1.SpeechClient | None = None


def _get_speech_client() -> speech_v1.SpeechClient:
    """Get or create the GCP Speech client using the service account JSON key."""
    global _speech_client
    if _speech_client is None:
        if not settings.gcp_credentials_json:
            raise ValueError("GCP_CREDENTIALS_JSON not configured — set path to service account JSON key file")
        credentials = service_account.Credentials.from_service_account_file(
            settings.gcp_credentials_json,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        _speech_client = speech_v1.SpeechClient(credentials=credentials)
        logger.info("Initialized GCP Speech client from %s", settings.gcp_credentials_json)
    return _speech_client


async def transcribe_audio(pcm_bytes: bytes) -> str:
    """
    Transcribe raw int16 PCM audio (16kHz mono) via GCP Cloud Speech-to-Text.
    Uses explicit service account credentials — no gcloud login or ADC needed.
    """
    import asyncio

    client = _get_speech_client()

    audio = speech_v1.RecognitionAudio(content=pcm_bytes)
    config = speech_v1.RecognitionConfig(
        encoding=speech_v1.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=settings.sample_rate,
        language_code="en-SG",
        alternative_language_codes=["zh", "ms", "ta"],
        enable_automatic_punctuation=True,
    )

    t0 = time.perf_counter()

    # Run synchronous gRPC call in thread pool to avoid blocking event loop
    response = await asyncio.to_thread(client.recognize, config=config, audio=audio)

    latency_ms = round((time.perf_counter() - t0) * 1000)

    transcript = " ".join(
        result.alternatives[0].transcript
        for result in response.results
        if result.alternatives
    ).strip()

    logger.info("Transcription completed in %dms — %d chars", latency_ms, len(transcript))
    return transcript


async def analyze_urgency(transcript: str) -> dict:
    """
    Send transcript to SEA-LION for urgency classification.
    Uses OpenAI-compatible API.
    """
    if not settings.sealion_api_key:
        raise ValueError("SEALION_API_KEY not configured")

    if not transcript.strip():
        return {
            "urgency_level": "low",
            "confidence_score": 0.0,
            "reasoning": "No speech detected in audio segment",
        }

    client = OpenAI(
        api_key=settings.sealion_api_key,
        base_url=settings.sealion_base_url,
    )

    t0 = time.perf_counter()

    completion = client.chat.completions.create(
        model=settings.sealion_model,
        messages=[
            {"role": "system", "content": URGENCY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Transcript:\n{transcript}"},
        ],
    )

    latency_ms = round((time.perf_counter() - t0) * 1000)
    raw = completion.choices[0].message.content.strip()

    logger.info("SEA-LION response in %dms: %s", latency_ms, raw[:200])

    # Parse JSON from response (handle possible markdown wrapping)
    try:
        cleaned = raw
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()

        parsed = json.loads(cleaned)
        return {
            "urgency_level": str(parsed.get("urgency_level", "low")),
            "confidence_score": float(parsed.get("confidence_score", 0.0)),
            "reasoning": str(parsed.get("reasoning", "")),
        }
    except (json.JSONDecodeError, KeyError, ValueError) as e:
        logger.warning("Failed to parse SEA-LION response as JSON: %s — raw: %s", e, raw)
        return {
            "urgency_level": "medium",
            "confidence_score": 0.5,
            "reasoning": f"Could not parse model response: {raw[:200]}",
        }


async def run_secondary_analysis(pcm_bytes: bytes) -> dict:
    """
    Full secondary pipeline: transcribe audio → analyze urgency.
    Returns combined result dict.
    """
    t0 = time.perf_counter()

    transcript = await transcribe_audio(pcm_bytes)
    urgency = await analyze_urgency(transcript)

    total_ms = round((time.perf_counter() - t0) * 1000)

    result = {
        "transcript": transcript,
        "urgency_level": urgency["urgency_level"],
        "confidence_score": urgency["confidence_score"],
        "reasoning": urgency["reasoning"],
        "latency_ms": total_ms,
    }

    logger.info(
        "Secondary analysis complete in %dms — urgency=%s score=%.2f",
        total_ms,
        result["urgency_level"],
        result["confidence_score"],
    )
    return result

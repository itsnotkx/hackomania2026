from __future__ import annotations

import asyncio

import numpy as np

from app.config import settings
from app.services.inference import run_inference
from app.utils.logging import get_logger
from app.utils.scoring import score_to_label

logger = get_logger(__name__)


def _load_audio_bytes(file_bytes: bytes, content_type: str) -> np.ndarray:
    """Load audio from file bytes, return float32 array at 16kHz.

    Uses ffmpeg directly for reliable decoding of all formats including webm/opus.
    """
    import subprocess
    import tempfile
    import soundfile as sf

    try:
        # Write input to a temp file (ffmpeg needs seekable input for some formats)
        with tempfile.NamedTemporaryFile(suffix=_ext_for(content_type), delete=False) as tmp_in:
            tmp_in.write(file_bytes)
            tmp_in_path = tmp_in.name

        # Convert to WAV 16kHz mono via ffmpeg
        tmp_out_path = tmp_in_path + ".wav"
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", tmp_in_path, "-ar", str(settings.sample_rate),
             "-ac", "1", "-f", "wav", tmp_out_path],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            raise ValueError(f"ffmpeg failed: {result.stderr.decode(errors='replace')[:200]}")

        data, _ = sf.read(tmp_out_path, dtype="float32")
        return data
    except ValueError:
        raise
    except Exception as e:
        logger.error("Failed to load audio: %s", e)
        raise ValueError(f"Could not decode audio: {e}")
    finally:
        import os
        for p in (tmp_in_path, tmp_out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def _ext_for(content_type: str) -> str:
    """Map content type to file extension for ffmpeg."""
    mapping = {
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "audio/mp4": ".m4a",
        "audio/m4a": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/ogg": ".ogg",
        "audio/flac": ".flac",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
    }
    return mapping.get(content_type, ".bin")


async def analyze_file(file_bytes: bytes, content_type: str, file_name: str) -> dict:
    """Segment file into 2s chunks and run inference on each."""
    audio = await asyncio.to_thread(_load_audio_bytes, file_bytes, content_type)
    duration_s = len(audio) / settings.sample_rate

    chunk_samples = settings.sample_rate * 2  # 2s chunks
    segments = []
    all_pcm_bytes = b""

    for i in range(0, len(audio), chunk_samples):
        chunk = audio[i:i + chunk_samples]
        if len(chunk) < chunk_samples // 4:  # skip very short tail
            break
        # Pad if short
        if len(chunk) < chunk_samples:
            chunk = np.pad(chunk, (0, chunk_samples - len(chunk)))
        chunk_bytes = (chunk * 32767).astype(np.int16).tobytes()
        all_pcm_bytes += chunk_bytes
        result = await asyncio.to_thread(run_inference, chunk_bytes)
        start_s = round(i / settings.sample_rate, 2)
        end_s = round(min((i + chunk_samples) / settings.sample_rate, duration_s), 2)
        segments.append({
            "start_s": start_s,
            "end_s": end_s,
            "score": result["score"],
            "label": result["label"],
        })

    scores = [s["score"] for s in segments]
    avg_score = round(sum(scores) / len(scores), 4) if scores else 0.0
    peak_score = round(max(scores), 4) if scores else 0.0
    fake_segments = sum(1 for s in segments if s["label"] == "likely_fake")
    fake_ratio = round(fake_segments / len(segments), 4) if segments else 0.0
    verdict = score_to_label(avg_score).value

    return {
        "session_id": None,  # caller sets this
        "file_name": file_name,
        "duration_s": round(duration_s, 2),
        "segments": segments,
        "overall": {
            "avg_score": avg_score,
            "peak_score": peak_score,
            "verdict": verdict,
            "fake_segment_ratio": fake_ratio,
        },
        "pcm_bytes": all_pcm_bytes,  # raw int16 PCM for secondary buffer; stripped before response
    }

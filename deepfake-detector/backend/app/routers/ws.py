from __future__ import annotations

import asyncio
import base64
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.services import inference as inference_service
from app.services import session_manager
from app.services.audio_processor import validate_chunk
from app.services.session_manager import Session
from app.utils.logging import get_logger
from app.utils.scoring import rolling_average

logger = get_logger(__name__)
router = APIRouter()


async def _run_secondary(ws: WebSocket, session: Session) -> None:
    """Background task: transcribe buffered audio and analyze urgency via SEA-LION."""
    from app.services import secondary_analyzer

    try:
        session.secondary_analysis_running = True
        buffer = session.secondary_audio_buffer
        session.secondary_audio_buffer = b""
        session.secondary_buffer_start = None

        logger.info(
            "Secondary analysis triggered for session=%s — buffer=%d bytes",
            session.session_id,
            len(buffer),
        )

        result = await secondary_analyzer.run_secondary_analysis(buffer)

        session.secondary_results.append(result)

        await ws.send_json({
            "type": "secondary_result",
            "transcript": result["transcript"],
            "urgency_level": result["urgency_level"],
            "confidence_score": result["confidence_score"],
            "reasoning": result["reasoning"],
            "latency_ms": result["latency_ms"],
        })

    except Exception as e:
        logger.error("Secondary analysis failed for session=%s: %s", session.session_id, e)
        await ws.send_json({
            "type": "error",
            "code": "SECONDARY_ANALYSIS_FAILED",
            "message": str(e),
        })
    finally:
        session.secondary_analysis_running = False


@router.websocket("/ws/v1/stream/{session_id}")
async def websocket_stream(ws: WebSocket, session_id: str):
    session = session_manager.get_session(session_id)
    if session is None:
        await ws.close(code=4004, reason="SESSION_NOT_FOUND")
        return

    await ws.accept()
    logger.info("WebSocket connected: session=%s", session_id)

    try:
        while True:
            # Receive binary frame (raw PCM) or text (control/JSON)
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                break

            audio_bytes: bytes | None = None
            seq: int = session.chunk_count

            # Handle text control messages
            if message.get("text"):
                try:
                    ctrl = json.loads(message["text"])
                    msg_type = ctrl.get("type")
                    if msg_type == "pause":
                        session.paused = True
                        continue
                    elif msg_type == "resume":
                        session.paused = False
                        continue
                    elif msg_type == "close":
                        break
                    elif msg_type == "audio_chunk":
                        is_remote = ctrl.get("is_remote_speaker", True)
                        if not is_remote:
                            continue  # skip own voice
                        if session.paused:
                            continue
                        seq = ctrl.get("seq", session.chunk_count)
                        audio_b64 = ctrl.get("audio_b64", "")
                        audio_bytes = base64.b64decode(audio_b64)
                    else:
                        # Unknown text frame — ignore
                        continue
                except (json.JSONDecodeError, Exception):
                    await ws.send_json({
                        "type": "error",
                        "code": "INVALID_AUDIO",
                        "message": "Could not parse text frame",
                    })
                    continue

            # Handle binary frame
            elif message.get("bytes"):
                if session.paused:
                    continue
                audio_bytes = message["bytes"]
                seq = session.chunk_count

            else:
                continue

            if audio_bytes is None:
                continue

            # Validate chunk
            valid, err = validate_chunk(audio_bytes)
            if not valid:
                await ws.send_json({
                    "type": "error",
                    "code": "INVALID_AUDIO",
                    "message": err,
                })
                continue

            if not inference_service.is_ready():
                await ws.send_json({
                    "type": "error",
                    "code": "MODEL_UNAVAILABLE",
                    "message": "Model is still loading, please wait",
                })
                continue

            # CRITICAL: run inference in thread pool — never on event loop
            result = await asyncio.to_thread(inference_service.run_inference, audio_bytes)

            session.add_result(
                seq=seq,
                score=result["score"],
                label=result["label"],
                confidence=result["confidence"],
            )
            rolling_avg = rolling_average(session.rolling_scores)

            await ws.send_json({
                "type": "result",
                "seq": seq,
                "score": result["score"],
                "label": result["label"],
                "confidence": result["confidence"],
                "rolling_avg": rolling_avg,
                "latency_ms": result["latency_ms"],
            })

            # ── Secondary analysis layer ── always runs alongside primary
            if settings.secondary_enabled:
                session.append_to_secondary_buffer(audio_bytes)
                if session.should_trigger_secondary():
                    asyncio.create_task(_run_secondary(ws, session))

    except WebSocketDisconnect:
        pass  # Normal client disconnect
    except Exception as e:
        logger.error("WebSocket error session=%s: %s", session_id, e)
    finally:
        logger.info("WebSocket disconnected: session=%s", session_id)


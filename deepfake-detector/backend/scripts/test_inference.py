"""
Test client for the NoScam backend.
Usage: python scripts/test_inference.py [SERVER_URL]
Example: BASE_URL=https://my-railway-url.railway.app python scripts/test_inference.py

Requires a running server and an active session.
"""
import asyncio
import json
import os
import pathlib
import sys
import time

import httpx
import numpy as np
import websockets

BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")
WS_BASE = BASE_URL.replace("http://", "ws://").replace("https://", "wss://")


async def create_session(base_url: str) -> str:
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{base_url}/api/v1/sessions", json={
            "source_type": "call",
            "client_platform": "desktop",
        })
        r.raise_for_status()
        return r.json()["session_id"]


async def send_frame(ws, audio_bytes: bytes) -> tuple[dict, float]:
    t0 = time.perf_counter()
    await ws.send(audio_bytes)
    response = await ws.recv()
    ms = (time.perf_counter() - t0) * 1000
    return json.loads(response), ms


async def main():
    print(f"Testing backend at {BASE_URL}")

    # Check health first
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{BASE_URL}/health")
            health = r.json()
            print(f"Health: {health}")
            if not health.get("model_loaded"):
                print("WARNING: Model not loaded yet — results may fail")
    except Exception as e:
        print(f"Could not connect to {BASE_URL} — is the server running? ({e})")
        sys.exit(1)

    # Create session
    session_id = await create_session(BASE_URL)
    print(f"Session: {session_id}")

    ws_url = f"{WS_BASE}/ws/v1/stream/{session_id}"

    async with websockets.connect(ws_url) as ws:
        # Test 1: Silence baseline
        print("\n[Test 1] Silence baseline (2s zeros)")
        silence = bytes(64000)  # 2s * 16000 * 2 bytes
        result, latency = await send_frame(ws, silence)
        print(f"  Result: {result}")
        print(f"  Round-trip: {latency:.0f}ms")
        if latency > 1500:
            print(f"  WARN: Latency {latency:.0f}ms exceeds 1500ms budget")

        # Test 2: 440Hz sine wave
        print("\n[Test 2] 440Hz sine wave (synthetic non-speech)")
        t = np.linspace(0, 2, 32000)
        sine = (np.sin(2 * np.pi * 440 * t) * 32767).astype(np.int16).tobytes()
        result, latency = await send_frame(ws, sine)
        print(f"  Result: {result}")
        print(f"  Round-trip: {latency:.0f}ms")

        # Test 3: Real audio files (if present)
        # Accepts ai_sample / human_sample in .wav, .mp3, or .m4a
        test_audio_dir = pathlib.Path(__file__).parent.parent / "test_audio"
        EXTENSIONS = [".wav", ".mp3", ".m4a"]

        def find_sample(stem: str) -> pathlib.Path | None:
            for ext in EXTENSIONS:
                p = test_audio_dir / (stem + ext)
                if p.exists():
                    return p
            return None

        ai_sample = find_sample("ai_sample")
        human_sample = find_sample("human_sample")

        if ai_sample and human_sample:
            import librosa
            print("\n[Test 3] Real audio accuracy test")
            for label, path in [("AI sample", ai_sample), ("Human sample", human_sample)]:
                data, _ = librosa.load(str(path), sr=16000, mono=True)
                chunk = data[:32000]  # first 2s
                if len(chunk) < 32000:
                    chunk = np.pad(chunk, (0, 32000 - len(chunk)))
                pcm = (chunk * 32767).astype(np.int16).tobytes()
                result, latency = await send_frame(ws, pcm)
                print(f"  {label} ({path.suffix}): {result} ({latency:.0f}ms)")
        else:
            print(f"\n[Test 3] SKIP: no test audio at {test_audio_dir}")
            print("  Place ai_sample and human_sample (.wav, .mp3, or .m4a) there to run accuracy tests")

    print("\nAll tests complete.")


if __name__ == "__main__":
    asyncio.run(main())

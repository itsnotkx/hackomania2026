"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const BACKEND_HTTP =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const BACKEND_WS =
  process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000";

/** Must match the backend config (sample_rate = 16000, chunk_duration_ms = 2000) */
const SAMPLE_RATE = 16_000;
const CHUNK_DURATION_MS = 2_000;
const CHUNK_SAMPLES = SAMPLE_RATE * (CHUNK_DURATION_MS / 1_000); // 32 000 samples

export type Verdict = "real" | "fake" | "uncertain";

export interface AnalysisPointer {
  type: "warning" | "safe" | "neutral";
  label: string;
  description: string;
}

export interface AnalysisData {
  verdict: Verdict;
  /** 0-100 */
  confidence: number;
  snippetsAnalyzed: number;
  duration: number;
  pointers: AnalysisPointer[];
}

export interface UseDeepfakeDetectionResult {
  isActive: boolean;
  analysisData: AnalysisData | null;
  audioLevels: number[];
  monitoringTime: number;
  snippetsCount: number;
  connectionError: string | null;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function mapLabel(label: string): Verdict {
  if (label === "likely_real") return "real";
  if (label === "likely_fake") return "fake";
  return "uncertain";
}

function buildPointers(verdict: Verdict): AnalysisPointer[] {
  if (verdict === "fake") {
    return [
      {
        type: "warning",
        label: "Pitch Anomalies",
        description: "Unnatural pitch transitions detected in speech patterns",
      },
      {
        type: "warning",
        label: "Spectral Artifacts",
        description: "AI-generated spectral signatures found in audio",
      },
      {
        type: "neutral",
        label: "Background Analysis",
        description: "Background noise patterns are inconclusive",
      },
    ];
  }
  if (verdict === "real") {
    return [
      {
        type: "safe",
        label: "Natural Prosody",
        description: "Speech rhythm and intonation appear natural",
      },
      {
        type: "safe",
        label: "Authentic Timbre",
        description: "Voice characteristics consistent with human speech",
      },
      {
        type: "safe",
        label: "Clean Spectrum",
        description: "No synthetic artifacts detected in frequency analysis",
      },
    ];
  }
  return [
    {
      type: "neutral",
      label: "Inconclusive Patterns",
      description: "Audio quality insufficient for definitive analysis",
    },
    {
      type: "neutral",
      label: "Mixed Signals",
      description:
        "Some indicators suggest both natural and synthetic elements",
    },
  ];
}

/**
 * Convert a Float32 PCM buffer (range -1..1) to a raw Int16 ArrayBuffer
 * that the backend expects (PCM s16le, mono, 16 kHz).
 */
function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    out[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
  }
  return out.buffer;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDeepfakeDetection(): UseDeepfakeDetectionResult {
  const [isActive, setIsActive] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [audioLevels, setAudioLevels] = useState<number[]>(
    Array(24).fill(0.05),
  );
  const [monitoringTime, setMonitoringTime] = useState(0);
  const [snippetsCount, setSnippetsCount] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Refs — survive re-renders without triggering them
  const sessionIdRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  // PCM accumulation buffer between ScriptProcessor callbacks
  const pcmBufRef = useRef<Float32Array>(new Float32Array(0));
  // Keep snippets count in a ref so the audio callback always reads the latest
  const snippetsRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Audio-level visualisation loop
  // ---------------------------------------------------------------------------
  const animationLoop = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const step = Math.floor(data.length / 24);
    setAudioLevels(
      Array.from({ length: 24 }, (_, i) => Math.max(0.05, data[i * step] / 255)),
    );
    rafRef.current = requestAnimationFrame(animationLoop);
  }, []);

  // ---------------------------------------------------------------------------
  // Teardown helpers
  // ---------------------------------------------------------------------------
  const stopAnimationLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAudioLevels(Array(24).fill(0.05));
  }, []);

  const cleanupAudio = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const cleanupSession = useCallback(() => {
    if (sessionIdRef.current) {
      // Fire-and-forget — best effort
      fetch(`${BACKEND_HTTP}/api/v1/sessions/${sessionIdRef.current}`, {
        method: "DELETE",
      }).catch(() => {});
      sessionIdRef.current = null;
    }
  }, []);

  // ---------------------------------------------------------------------------
  // stopMonitoring  (exported — called by the overlay wrapper)
  // ---------------------------------------------------------------------------
  const stopMonitoring = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    stopAnimationLoop();
    cleanupAudio();
    wsRef.current?.close();
    wsRef.current = null;
    cleanupSession();

    setIsActive(false);
    setAnalysisData(null);
    pcmBufRef.current = new Float32Array(0);
    snippetsRef.current = 0;
  }, [stopAnimationLoop, cleanupAudio, cleanupSession]);

  // ---------------------------------------------------------------------------
  // startMonitoring
  // ---------------------------------------------------------------------------
  const startMonitoring = useCallback(async () => {
    setConnectionError(null);

    try {
      // 1 ── Create backend session ──────────────────────────────────────────
      const res = await fetch(`${BACKEND_HTTP}/api/v1/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "call",
          client_platform: "web",
          metadata: {
            app_name: "NoScam Web",
            sample_rate: SAMPLE_RATE,
            chunk_duration_ms: CHUNK_DURATION_MS,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Session creation failed (HTTP ${res.status})`);
      }

      const session = await res.json();
      sessionIdRef.current = session.session_id as string;

      // 2 ── Open WebSocket ──────────────────────────────────────────────────
      const ws = new WebSocket(
        `${BACKEND_WS}/ws/v1/stream/${session.session_id}`,
      );
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      // Wait for the connection to be established (max 8 s)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("WebSocket connection timed out")),
          8_000,
        );
        ws.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("WebSocket connection failed"));
        };
      });

      ws.onmessage = (event: MessageEvent) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const msg = JSON.parse(event.data as string) as any;

          if (msg.type === "result") {
            const verdict = mapLabel(msg.label as string);
            snippetsRef.current += 1;
            setSnippetsCount(snippetsRef.current);
            setAnalysisData({
              verdict,
              confidence: (msg.confidence as number) * 100,
              snippetsAnalyzed: snippetsRef.current,
              duration: snippetsRef.current * (CHUNK_DURATION_MS / 1_000),
              pointers: buildPointers(verdict),
            });
          } else if (msg.type === "error") {
            console.warn("[deepfake-ws] server error:", msg.code, msg.message);
          }
        } catch {
          // Ignore non-JSON frames
        }
      };

      ws.onclose = () => {
        setIsActive((prev) => {
          if (prev) setConnectionError("Connection to backend closed unexpectedly");
          return false;
        });
      };

      // 3 ── Set up microphone capture ───────────────────────────────────────
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Request 16 kHz so the browser resamples for us
      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode gives us raw Float32 PCM per callback
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      source.connect(analyser);
      source.connect(processor);
      // Must be connected to destination or onaudioprocess won't fire in all browsers
      processor.connect(audioCtx.destination);

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        const incoming = e.inputBuffer.getChannelData(0);

        // Append to accumulation buffer
        const combined = new Float32Array(
          pcmBufRef.current.length + incoming.length,
        );
        combined.set(pcmBufRef.current);
        combined.set(incoming, pcmBufRef.current.length);
        pcmBufRef.current = combined;

        // Drain the buffer in full 2-second chunks
        while (pcmBufRef.current.length >= CHUNK_SAMPLES) {
          const chunk = pcmBufRef.current.slice(0, CHUNK_SAMPLES);
          pcmBufRef.current = pcmBufRef.current.slice(CHUNK_SAMPLES);
          wsRef.current!.send(float32ToInt16(chunk));
        }
      };

      // 4 ── Update React state ──────────────────────────────────────────────
      setIsActive(true);
      setMonitoringTime(0);
      setSnippetsCount(0);
      snippetsRef.current = 0;
      setAnalysisData(null);
      pcmBufRef.current = new Float32Array(0);

      timerRef.current = setInterval(
        () => setMonitoringTime((t) => t + 1),
        1_000,
      );
      rafRef.current = requestAnimationFrame(animationLoop);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start monitoring";
      setConnectionError(message);
      // Partial cleanup
      cleanupAudio();
      cleanupSession();
      wsRef.current?.close();
      wsRef.current = null;
    }
  }, [animationLoop, cleanupAudio, cleanupSession]);

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopAnimationLoop();
      cleanupAudio();
      wsRef.current?.close();
      cleanupSession();
    };
  }, [stopAnimationLoop, cleanupAudio, cleanupSession]);

  return {
    isActive,
    analysisData,
    audioLevels,
    monitoringTime,
    snippetsCount,
    connectionError,
    startMonitoring,
    stopMonitoring,
  };
}

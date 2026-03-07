import { useCallback, useEffect, useRef, useState } from 'react';
import type { BadgeState } from '../components/overlay/BadgeOverlay';

export interface VerdictResult {
  label: 'AI' | 'HUMAN' | 'UNCERTAIN';
  score: number;
  ms: number;
}

interface UseWebSocketOptions {
  url: string;
  onVerdict: (result: VerdictResult) => void;
}

interface UseWebSocketReturn {
  badgeState: BadgeState;
  sendChunk: (chunk: ArrayBuffer) => void;
  connect: () => void;
  disconnect: () => void;
}

const KEEPALIVE_INTERVAL_MS = 15_000;
const MAX_RECONNECT_DELAY_MS = 8_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export function useWebSocket({ url, onVerdict }: UseWebSocketOptions): UseWebSocketReturn {
  const [badgeState, setBadgeState] = useState<BadgeState>('DISCONNECTED');
  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const intentionalDisconnectRef = useRef(false);

  const clearKeepalive = () => {
    if (keepaliveTimerRef.current) {
      clearInterval(keepaliveTimerRef.current);
      keepaliveTimerRef.current = null;
    }
  };

  const clearReconnect = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    intentionalDisconnectRef.current = false;
    clearReconnect();

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
      setBadgeState('ANALYZING');

      // Keepalive: send ping every 15s to prevent cloud idle timeout (Railway/Fly.io closes at 30-60s)
      keepaliveTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, KEEPALIVE_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      try {
        const result: VerdictResult = JSON.parse(event.data as string);
        if (result.label === 'AI') {
          setBadgeState('AI_DETECTED');
        } else if (result.label === 'HUMAN') {
          setBadgeState('HUMAN');
        }
        // UNCERTAIN stays as ANALYZING
        onVerdict(result);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      clearKeepalive();
      setBadgeState('DISCONNECTED');

      if (!intentionalDisconnectRef.current) {
        // Exponential backoff: 1s → 2s → 4s → 8s (capped)
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror — reconnect logic is in onclose
    };

    wsRef.current = ws;
  }, [url, onVerdict]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearKeepalive();
    clearReconnect();
    wsRef.current?.close();
    wsRef.current = null;
    setBadgeState('DISCONNECTED');
  }, []);

  /**
   * Send a 64000-byte ArrayBuffer chunk to the backend.
   * IMPORTANT: send chunk directly as ArrayBuffer for binary WebSocket frames.
   */
  const sendChunk = useCallback((chunk: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(chunk);
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { badgeState, sendChunk, connect, disconnect };
}

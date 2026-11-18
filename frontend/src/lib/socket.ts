import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerMessage } from "./types";

export type SocketStatus = "connecting" | "open" | "closed" | "unauthorized";

const RETRY_DELAYS = [1000, 2000, 5000];
const STALE_AFTER_HIDDEN_MS = 5000; // phones often keep a dead socket "open" after sleep

/** WebSocket with auto-reconnect. Changing `path` recreates the socket; `null` means "don't connect". */
export function useSocket<V>(path: string | null, onMessage: (m: ServerMessage<V>) => void) {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    if (path === null) return;
    let stopped = false;
    let unauthorized = false;
    let attempt = 0;
    let timer: number | undefined;
    let hiddenAt = 0;

    const connect = () => {
      if (stopped || unauthorized) return;
      window.clearTimeout(timer);
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}${path}`);
      wsRef.current = ws;
      setStatus("connecting");
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      ws.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data));
        } catch {
          /* ignore malformed message */
        }
      };
      ws.onclose = (e) => {
        if (wsRef.current !== ws) return; // replaced by a newer socket
        wsRef.current = null;
        if (stopped) return;
        if (e.code === 4401) {
          unauthorized = true;
          setStatus("unauthorized");
          return;
        }
        setStatus("closed");
        const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
        attempt += 1;
        timer = window.setTimeout(connect, delay);
      };
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const ws = wsRef.current;
      const stale = hiddenAt > 0 && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS;
      hiddenAt = 0;
      if (!ws || ws.readyState > WebSocket.OPEN) {
        connect();
      } else if (stale) {
        wsRef.current = null;
        ws.close();
        connect();
      }
    };
    const onOnline = () => {
      const ws = wsRef.current;
      if (!ws || ws.readyState > WebSocket.OPEN) connect();
    };

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [path]);

  /** Returns false if the socket is not open (the caller may retry after reconnect). */
  const send = useCallback((cmd: object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
      return true;
    }
    return false;
  }, []);

  return { send, status };
}

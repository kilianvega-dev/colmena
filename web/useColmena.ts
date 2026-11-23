import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, SessionInfo } from '../server/protocol.ts';

type Listener = (data: string, replay: boolean) => void;
const MAX_BUFFER = 1_000_000;

export function useColmena() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const errTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listeners = useRef(new Map<string, Set<Listener>>());
  // El replay llega antes de que el Panel exista: se guarda para entregarlo al suscribirse.
  const buffers = useRef(new Map<string, string>());
  const sessionsRef = useRef<SessionInfo[]>([]);
  sessionsRef.current = sessions;
  // "Abrir de nuevo": el panel viejo se quita cuando aparece la sesión nueva.
  const replacing = useRef<{ id: string; count: number } | null>(null);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.current = sock;
      sock.onopen = () => { setConnected(true); setLastError(null); };
      sock.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
      sock.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data)) as ServerMessage;
        switch (m.type) {
          case 'snapshot':
            if (replacing.current && m.sessions.length > replacing.current.count) {
              sock.send(JSON.stringify({ type: 'remove', id: replacing.current.id }));
              replacing.current = null;
            }
            setSessions(m.sessions); setOrder(m.order); setRecents(m.recents);
            break;
          case 'session':
            setSessions((s) => s.some((x) => x.id === m.session.id)
              ? s.map((x) => (x.id === m.session.id ? m.session : x))
              : [...s, m.session]);
            break;
          case 'output':
            buffers.current.set(m.id, ((buffers.current.get(m.id) ?? '') + m.data).slice(-MAX_BUFFER));
            listeners.current.get(m.id)?.forEach((cb) => cb(m.data, false));
            break;
          case 'replay':
            buffers.current.set(m.id, m.data);
            listeners.current.get(m.id)?.forEach((cb) => cb(m.data, true));
            break;
          case 'removed':
            buffers.current.delete(m.id);
            setSessions((s) => s.filter((x) => x.id !== m.id));
            setOrder((o) => o.filter((x) => x !== m.id));
            break;
          case 'error':
            replacing.current = null;
            setLastError(m.message);
            clearTimeout(errTimer.current);
            errTimer.current = setTimeout(() => setLastError(null), 6000);
            break;
        }
      };
    };
    connect();
    return () => { closed = true; clearTimeout(timer); ws.current?.close(); };
  }, []);

  const send = useCallback((m: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(m));
  }, []);

  const reopen = useCallback((id: string, cwd: string) => {
    replacing.current = { id, count: sessionsRef.current.length };
    send({ type: 'create', kind: 'terminal', cwd });
  }, [send]);

  const subscribe = useCallback((id: string, cb: Listener) => {
    let set = listeners.current.get(id);
    if (!set) listeners.current.set(id, (set = new Set()));
    const mine = set;
    mine.add(cb);
    const buf = buffers.current.get(id);
    if (buf !== undefined) cb(buf, true);
    return () => { mine.delete(cb); };
  }, []);

  const dismissError = useCallback(() => { clearTimeout(errTimer.current); setLastError(null); }, []);

  return { sessions, order, recents, connected, send, reopen, subscribe, lastError, dismissError };
}

import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { ClientMessage, SessionInfo } from '../server/protocol.ts';

const STATUS_COLOR: Record<string, string> = {
  abierta: 'bg-emerald-600',
  cerrada: 'bg-red-700',
  iniciando: 'bg-sky-600',
  trabajando: 'bg-amber-600',
  esperando: 'bg-emerald-600',
  terminado: 'bg-neutral-600',
  cerrado: 'bg-red-700',
};

interface Props {
  session: SessionInfo;
  send: (m: ClientMessage) => void;
  subscribe: (id: string, cb: (data: string, replay: boolean) => void) => () => void;
}

export function Panel({ session, send, subscribe }: Props) {
  const { id, kind, cwd, status } = session;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = new Terminal({ fontSize: 13, theme: { background: '#0a0a0a' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(box.current!);
    const unsub = subscribe(id, (data, replay) => {
      if (replay) term.reset();
      term.write(data);
    });
    const onData = term.onData((data) => send({ type: 'input', id, data }));
    let cols = 0, rows = 0;
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        if (term.cols === cols && term.rows === rows) return;
        ({ cols, rows } = term);
        send({ type: 'resize', id, cols, rows });
      } catch { /* panel sin tamaño todavía */ }
    });
    ro.observe(box.current!);
    return () => { ro.disconnect(); onData.dispose(); unsub(); term.dispose(); };
  }, [id, send, subscribe]);

  const name = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
  const label = kind === 'terminal' ? (status === 'cerrado' ? 'cerrada' : 'abierta') : status;
  const btn = 'rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700';

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded border ${status === 'esperando' ? 'waiting border-emerald-500' : 'border-neutral-800'}`}>
      <div className="flex items-center gap-2 bg-neutral-900 px-2 py-1 text-sm">
        <span className="truncate font-medium" title={cwd}>{name}</span>
        <span className="text-neutral-400">{kind === 'claude' ? 'Claude' : 'Terminal'}</span>
        <span className={`rounded px-2 py-0.5 text-xs text-white ${STATUS_COLOR[label]}`}>{label}</span>
        <span className="flex-1" />
        {status === 'cerrado' && kind === 'claude' && (
          <button className={btn} onClick={() => send({ type: 'resume', id })}>Reanudar</button>
        )}
        {status === 'cerrado' && kind === 'terminal' && (
          <button
            className={btn}
            onClick={() => { send({ type: 'create', kind: 'terminal', cwd }); send({ type: 'remove', id }); }}
          >
            Abrir de nuevo
          </button>
        )}
        <button className={btn} onClick={() => send({ type: 'close', id })}>Cerrar</button>
        <button className={btn} onClick={() => send({ type: 'remove', id })}>Quitar</button>
      </div>
      <div className="relative min-h-0 min-w-0 flex-1 bg-neutral-950">
        <div ref={box} className="absolute inset-0" />
      </div>
    </div>
  );
}

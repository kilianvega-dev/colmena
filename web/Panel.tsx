import { useEffect, useRef, useState } from 'react';
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
  position: number; // 1-based; Alt+position lo enfoca (hasta 9)
  onMove: (id: string, to: number) => void; // `to` es base 0
  send: (m: ClientMessage) => void;
  reopen: (id: string, cwd: string) => void;
  subscribe: (id: string, cb: (data: string, replay: boolean) => void) => () => void;
}

const DRAG_TYPE = 'application/x-colmena-panel';

export function Panel({ session, position, onMove, send, reopen, subscribe }: Props) {
  const [dropTarget, setDropTarget] = useState(false);
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

  const folder = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
  const name = session.name ?? folder;
  const [editing, setEditing] = useState(false);
  const commit = (value: string) => {
    setEditing(false);
    const v = value.trim();
    if (v !== name) send({ type: 'rename', id, name: v === folder ? '' : v });
  };
  const label = kind === 'terminal' ? (status === 'cerrado' ? 'cerrada' : 'abierta') : status;
  const btn = 'rounded bg-neutral-800 px-2 py-0.5 text-xs hover:bg-neutral-700';

  return (
    <div
      data-panel-id={id}
      className={`flex h-full flex-col overflow-hidden rounded border ${dropTarget ? 'border-sky-400' : status === 'esperando' ? 'waiting border-emerald-500' : 'border-neutral-800'}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(false);
      }}
      onDrop={(e) => {
        setDropTarget(false);
        const dragged = e.dataTransfer.getData(DRAG_TYPE);
        if (!dragged || dragged === id) return;
        e.preventDefault();
        onMove(dragged, position - 1);
      }}
    >
      <div
        draggable={!editing}
        title="Arrastra para mover el panel (o Alt+Shift+←/→)"
        className={`flex items-center gap-2 bg-neutral-900 px-2 py-1 text-sm ${editing ? '' : 'cursor-grab active:cursor-grabbing'}`}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        {position <= 9 && (
          <kbd className="rounded border border-neutral-700 px-1 font-mono text-xs text-neutral-400" title={`Alt+${position} enfoca este panel`}>
            {position}
          </kbd>
        )}
        {editing ? (
          <input
            autoFocus
            defaultValue={name}
            maxLength={60}
            aria-label="Nombre del panel"
            className="w-48 rounded border border-neutral-600 bg-neutral-950 px-1 font-medium"
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            className="truncate font-medium hover:underline"
            title={`${cwd}\nDoble clic o F2 para renombrar`}
            aria-label={`${name}, renombrar panel`}
            onDoubleClick={() => setEditing(true)}
            onKeyDown={(e) => { if (e.key === 'F2' || e.key === 'Enter') setEditing(true); }}
          >
            {name}
          </button>
        )}
        <span className="text-neutral-400">{kind === 'claude' ? 'Claude' : 'Terminal'}</span>
        <span className={`rounded px-2 py-0.5 text-xs text-white ${STATUS_COLOR[label]}`}>{label}</span>
        <span className="flex-1" />
        {status === 'cerrado' && kind === 'claude' && (
          <button className={btn} onClick={() => send({ type: 'resume', id })}>Reanudar</button>
        )}
        {status === 'cerrado' && kind === 'terminal' && (
          <button
            className={btn}
            onClick={() => reopen(id, cwd)}
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

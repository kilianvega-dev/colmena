import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, SessionKind } from '../server/protocol.ts';

interface Props {
  recents: string[];
  send: (m: ClientMessage) => void;
  error: string | null;
  sessionCount: number;
  onClose: () => void;
}

const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function NewSessionDialog({ recents, send, error, sessionCount, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<SessionKind>('claude');
  const [cwd, setCwd] = useState('');
  const initialCount = useRef(sessionCount);

  useEffect(() => {
    dlg.current?.showModal(); // cierra con Escape; showModal enfoca el primer botón, así que se enfoca la ruta a mano
    input.current?.focus();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
  }, []);

  // Si el servidor responde error el diálogo sigue abierto; si crea, la lista de sesiones crece y se cierra.
  useEffect(() => { if (sessionCount > initialCount.current) onClose(); }, [sessionCount, onClose]);

  const submit = (path: string) => {
    if (path.trim()) send({ type: 'create', kind, cwd: path.trim() });
  };

  const tab = (k: SessionKind, label: string) => (
    <button
      type="button"
      aria-pressed={kind === k}
      className={`rounded px-3 py-1 text-sm ${kind === k ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
      onClick={() => setKind(k)}
    >
      {label}
    </button>
  );

  return (
    <dialog
      ref={dlg}
      aria-label="Nueva sesión"
      onClose={onClose}
      className="m-auto w-full max-w-lg rounded border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 backdrop:bg-black/60"
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(cwd); }} className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Nueva sesión</h2>
        <div className="flex gap-2">{tab('claude', 'Claude')}{tab('terminal', 'Terminal')}</div>
        <input
          ref={input}
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Pega la ruta de la carpeta"
          aria-label="Ruta de la carpeta"
          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1"
        />
        {recents.length > 0 && (
          <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
            {recents.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1 text-left hover:bg-neutral-800 ${cwd === r ? 'bg-neutral-800' : ''}`}
                  onClick={() => setCwd(r)}
                >
                  <span className="block text-sm font-medium">{folderName(r)}</span>
                  <span className="block truncate text-xs text-neutral-400">{r}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700" onClick={onClose}>Cancelar</button>
          <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600">Crear</button>
        </div>
      </form>
    </dialog>
  );
}

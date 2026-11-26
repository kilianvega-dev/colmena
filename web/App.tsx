import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Group, Panel as ResizablePanel, Separator } from 'react-resizable-panels';
import { NewSessionDialog } from './NewSessionDialog.tsx';
import { notifyWaiting, titleFor, waitingCount } from './notify.ts';
import { Panel } from './Panel.tsx';
import { moved, shortcutFor } from './shortcuts.ts';
import { useColmena } from './useColmena.ts';

// 1 -> 1x1, 2 -> 2x1, 3-4 -> 2x2, 5-6 -> 3x2, más -> 3 columnas.
function rowsOf<T>(items: T[]): T[][] {
  const cols = items.length <= 1 ? 1 : items.length <= 4 ? 2 : 3;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return rows;
}

export function App() {
  const { sessions, order, recents, connected, send, reopen, subscribe, lastError, dismissError } = useColmena();

  const [dialogOpen, setDialogOpen] = useState(false);
  const closeDialog = useCallback(() => setDialogOpen(false), []);
  const prev = useRef<Map<string, string> | null>(null);

  useEffect(() => { document.title = titleFor(waitingCount(sessions)); }, [sessions]);

  // Solo suena al pasar a esperando; la primera carga (prev null) o una sesión nueva ya esperando no cuenta.
  useEffect(() => {
    const before = prev.current;
    if (before) for (const s of sessions) if (s.status === 'esperando' && before.get(s.id) !== undefined && before.get(s.id) !== 'esperando') notifyWaiting(s);
    if (connected || sessions.length) prev.current = new Map(sessions.map((s) => [s.id, s.status]));
  }, [sessions, connected]);

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const ids = [...order.filter((id) => byId.has(id)), ...sessions.map((s) => s.id).filter((id) => !order.includes(id))];

  const idsRef = useRef(ids);
  idsRef.current = ids;
  // Mover un panel de fila lo vuelve a montar y pierde el foco: se recupera cuando llega el orden nuevo.
  const refocus = useRef<string | null>(null);
  const move = useCallback((id: string, to: number) => {
    const next = moved(idsRef.current, id, to);
    if (next.join() === idsRef.current.join()) return;
    send({ type: 'reorder', ids: next });
  }, [send]);
  useEffect(() => {
    if (!refocus.current) return;
    document.querySelector<HTMLElement>(`[data-panel-id="${refocus.current}"] .xterm-helper-textarea`)?.focus();
    refocus.current = null;
  });
  useEffect(() => {
    // captura: corre antes que xterm, que se quedaría con la tecla
    const onKey = (e: KeyboardEvent) => {
      const sc = shortcutFor(e);
      if (!sc) return;
      if (sc.type === 'focus' && sc.index >= idsRef.current.length) return;
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-panel-id]')?.dataset.panelId;
      if (sc.type === 'move' && !focused) return;
      e.preventDefault();
      e.stopPropagation();
      if (sc.type === 'new') {
        dismissError();
        setDialogOpen(true);
      } else if (sc.type === 'move') {
        refocus.current = focused!;
        move(focused!, idsRef.current.indexOf(focused!) + sc.delta);
      } else {
        document.querySelector<HTMLElement>(`[data-panel-id="${idsRef.current[sc.index]}"] .xterm-helper-textarea`)?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dismissError, move]);
  const rows = rowsOf(ids.map((id) => byId.get(id)!));
  const sep = 'bg-neutral-800 hover:bg-neutral-600';

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 bg-neutral-900 px-3 py-1">
        <span className="flex-1 text-sm font-medium">Colmena</span>
        <button
          className="rounded bg-emerald-700 px-3 py-0.5 text-sm hover:bg-emerald-600"
          title="Alt+N"
          aria-keyshortcuts="Alt+N"
          onClick={() => { dismissError(); setDialogOpen(true); }}
        >
          Nueva sesión
        </button>
      </div>
      {dialogOpen && (
        <NewSessionDialog recents={recents} send={send} error={lastError} sessionCount={sessions.length} onClose={closeDialog} />
      )}
      {(!connected || lastError) && (
        <div className="flex items-center bg-red-900 px-3 py-1 text-sm">
          <span className="flex-1">{!connected ? 'Sin conexión con el servidor, reintentando…' : lastError}</span>
          {connected && <button aria-label="Cerrar aviso" className="px-2" onClick={dismissError}>×</button>}
        </div>
      )}
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-neutral-400">No hay sesiones abiertas</div>
      ) : (
        // key por forma de la cuadrícula: al cambiar filas/columnas se reinician los tamaños
        <Group key={rows.map((r) => r.length).join('-')} orientation="vertical" className="min-h-0 flex-1 p-1">
          {rows.map((row, i) => (
            <Fragment key={`row-${i}`}>
              {i > 0 && <Separator className={`h-1 ${sep}`} />}
              <ResizablePanel id={`row-${i}`} minSize="10%">
                <Group orientation="horizontal">
                  {row.map((s, j) => (
                    <Fragment key={s.id}>
                      {j > 0 && <Separator className={`w-1 ${sep}`} />}
                      <ResizablePanel id={s.id} minSize="10%">
                        <Panel session={s} position={ids.indexOf(s.id) + 1} onMove={move} send={send} reopen={reopen} subscribe={subscribe} />
                      </ResizablePanel>
                    </Fragment>
                  ))}
                </Group>
              </ResizablePanel>
            </Fragment>
          ))}
        </Group>
      )}
    </div>
  );
}

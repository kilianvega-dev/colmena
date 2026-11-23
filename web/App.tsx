import { Fragment, useEffect } from 'react';
import { Group, Panel as ResizablePanel, Separator } from 'react-resizable-panels';
import { Panel } from './Panel.tsx';
import { useColmena } from './useColmena.ts';

// 1 -> 1x1, 2 -> 2x1, 3-4 -> 2x2, 5-6 -> 3x2, más -> 3 columnas.
function rowsOf<T>(items: T[]): T[][] {
  const cols = items.length <= 1 ? 1 : items.length <= 4 ? 2 : 3;
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return rows;
}

export function App() {
  const { sessions, order, connected, send, subscribe, lastError, dismissError } = useColmena();

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { colmena: unknown }).colmena = { send };
  }, [send]);

  const byId = new Map(sessions.map((s) => [s.id, s]));
  const ids = [...order.filter((id) => byId.has(id)), ...sessions.map((s) => s.id).filter((id) => !order.includes(id))];
  const rows = rowsOf(ids.map((id) => byId.get(id)!));
  const sep = 'bg-neutral-800 hover:bg-neutral-600';

  return (
    <div className="flex h-full flex-col">
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
                        <Panel session={s} send={send} subscribe={subscribe} />
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

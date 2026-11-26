import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { SessionInfo } from './protocol.ts';

export interface SavedState {
  sessions: (Omit<SessionInfo, 'status' | 'exitCode'> & { resumeId?: string })[];
  order: string[];
  recents: string[];
}

const empty = (): SavedState => ({ sessions: [], order: [], recents: [] });

const isStr = (x: unknown): x is string => typeof x === 'string';
// Un archivo editado a mano no debe tumbar el arranque: se descartan solo las entradas inválidas.
const validSession = (s: any): s is SavedState['sessions'][number] =>
  !!s && isStr(s.id) && isStr(s.cwd) && (s.kind === 'claude' || s.kind === 'terminal')
  && (s.name === undefined || isStr(s.name)) && (s.resumeId === undefined || isStr(s.resumeId));

export async function loadState(file: string): Promise<SavedState> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    return empty();
  }
  try {
    const s = JSON.parse(raw);
    if (Array.isArray(s?.sessions) && Array.isArray(s.order) && Array.isArray(s.recents)) {
      return { sessions: s.sessions.filter(validSession), order: s.order.filter(isStr), recents: s.recents.filter(isStr) };
    }
  } catch {}
  await copyFile(file, file + '.bak');
  return empty();
}

export async function saveState(file: string, s: SavedState): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file + '.tmp', JSON.stringify(s, null, 2));
  await rename(file + '.tmp', file);
}

export function addRecent(recents: string[], cwd: string): string[] {
  const k = cwd.toLowerCase();
  return [cwd, ...recents.filter((r) => r.toLowerCase() !== k)].slice(0, 10);
}

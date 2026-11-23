import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import type { SessionInfo, SessionKind } from './protocol.ts';
import type { SavedState } from './store.ts';
import { nextStatus } from './state.ts';
import { RingBuffer } from './ring-buffer.ts';

export interface PtyLike {
  onData(cb: (d: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(d: string): void;
  resize(c: number, r: number): void;
  kill(): void;
}

export type Spawn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; cols: number; rows: number },
) => PtyLike;

interface Entry {
  info: SessionInfo;
  pty: PtyLike | null;
  buffer: RingBuffer;
}

interface Opts {
  spawn: Spawn;
  hooksPath: string;
  port: number;
  token: string;
  claudeBin: string;
  shell: string;
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Entry>();
  private opts: Opts;

  constructor(opts: Opts) {
    super();
    this.opts = opts;
  }

  create(kind: SessionKind, cwd: string): SessionInfo {
    let ok = false;
    try {
      ok = statSync(cwd).isDirectory();
    } catch {}
    if (!ok) throw new Error(`La carpeta no existe: ${cwd}`);
    const id = randomUUID();
    const entry: Entry = {
      info: { id, kind, cwd, status: 'iniciando', exitCode: null },
      pty: null,
      buffer: new RingBuffer(200_000),
    };
    this.launch(entry, false); // si spawn lanza, la sesión no se registra
    this.sessions.set(id, entry);
    this.emitSession(entry);
    return { ...entry.info };
  }

  resume(id: string): SessionInfo {
    const entry = this.sessions.get(id);
    if (!entry) throw new Error('Sesión desconocida');
    if (entry.info.kind !== 'claude') throw new Error('Solo se pueden reanudar sesiones de Claude');
    if (entry.info.status !== 'cerrado') throw new Error('La sesión no está cerrada');
    entry.info.status = 'iniciando';
    entry.info.exitCode = null;
    try {
      this.launch(entry, true);
    } catch (e) {
      entry.info.status = 'cerrado';
      this.emitSession(entry);
      throw e;
    }
    this.emitSession(entry);
    return { ...entry.info };
  }

  restore(saved: SavedState['sessions']): void {
    for (const s of saved) {
      const entry: Entry = {
        info: { ...s, status: 'cerrado', exitCode: null },
        pty: null,
        buffer: new RingBuffer(200_000),
      };
      this.sessions.set(s.id, entry);
      this.emitSession(entry);
    }
  }

  applyHook(sessionId: string, event: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    const next = nextStatus(entry.info.status, event);
    if (next !== entry.info.status) {
      entry.info.status = next;
      this.emitSession(entry);
    }
    return true;
  }

  write(id: string, data: string): void {
    this.sessions.get(id)?.pty?.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    this.sessions.get(id)?.pty?.resize(cols, rows);
  }

  close(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    if (entry.pty) {
      try {
        entry.pty.kill();
      } catch {}
    } else if (entry.info.status !== 'cerrado') {
      entry.info.status = 'cerrado';
      this.emitSession(entry);
    }
  }

  remove(id: string): void {
    const entry = this.sessions.get(id);
    if (!entry) return;
    this.sessions.delete(id);
    try {
      entry.pty?.kill();
    } catch {}
    entry.pty = null;
    this.emit('removed', id);
  }

  killAll(): void {
    for (const e of this.sessions.values()) e.pty?.kill();
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((e) => ({ ...e.info }));
  }

  replay(id: string): string {
    return this.sessions.get(id)?.buffer.toString() ?? '';
  }

  private emitSession(entry: Entry): void {
    this.emit('session', { ...entry.info });
  }

  private launch(entry: Entry, resuming: boolean): void {
    const { id, kind, cwd } = entry.info;
    const { spawn, hooksPath, port, token, claudeBin, shell } = this.opts;
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.COLMENA_PORT = String(port);
    env.COLMENA_TOKEN = token;
    env.COLMENA_SESSION = id;
    const [file, args] =
      kind === 'claude'
        ? [claudeBin, [resuming ? '--resume' : '--session-id', id, '--settings', hooksPath]]
        : [shell, []];
    const pty = spawn(file, args, { cwd, env, cols: 120, rows: 30 });
    entry.pty = pty;
    pty.onData((d) => {
      if (entry.pty !== pty) return;
      entry.buffer.push(d);
      this.emit('output', id, d);
    });
    pty.onExit(({ exitCode }) => {
      if (entry.pty !== pty) return;
      entry.pty = null;
      entry.info.status = 'cerrado';
      entry.info.exitCode = exitCode;
      this.emitSession(entry);
    });
  }
}

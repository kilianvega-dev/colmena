#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as pty from 'node-pty';
import { SessionManager } from './sessions.ts';
import type { Spawn } from './sessions.ts';
import { writeHooksFile } from './hooks.ts';
import { loadState } from './store.ts';
import { createServer } from './server.ts';

const dataDir = join(process.env.APPDATA ?? homedir(), 'colmena');
const port = Number(process.env.COLMENA_PORT ?? 4777);
const stateFile = join(dataDir, 'state.json');
const token = randomBytes(24).toString('hex');

// node-pty en Windows no resuelve el PATH: hay que darle la ruta completa.
function resolveOnPath(name: string): string {
  try {
    const lines = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8' })
      .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const found = lines.find((l) => l.toLowerCase().endsWith('.exe')) ?? lines[0];
    if (found) return found;
  } catch { /* no está en el PATH */ }
  console.error('No se encontró claude en el PATH. Instala Claude Code o define COLMENA_CLAUDE.');
  return name;
}

const spawn: Spawn = (file, args, { cwd, env, cols, rows }) =>
  pty.spawn(file, args, { name: 'xterm-256color', cwd, env, cols, rows, useConpty: true });

const hooksPath = await writeHooksFile(dataDir);
const state = await loadState(stateFile);
const manager = new SessionManager({
  spawn,
  hooksPath,
  port,
  token,
  claudeBin: process.env.COLMENA_CLAUDE ?? resolveOnPath('claude'),
  shell: process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? 'sh'),
});
manager.restore(state.sessions);

const staticDir = join(import.meta.dirname, '..', 'dist');
let srv: Awaited<ReturnType<typeof createServer>>;
try {
  srv = await createServer({
  manager,
  port,
  token,
  staticDir: existsSync(staticDir) ? staticDir : null,
  devPort: process.env.COLMENA_DEV === '1' ? 5173 : undefined,
  stateFile,
  recents: state.recents,
  order: state.order,
});
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw e;
  console.error(`El puerto ${port} ya está en uso. Cambia COLMENA_PORT.`);
  process.exit(1);
}
console.log(`Colmena en http://127.0.0.1:${srv.port}`);

let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  await manager.killAll();
  await srv.close(); // también guarda el estado
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

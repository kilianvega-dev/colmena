import { randomBytes } from 'node:crypto';
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

const spawn: Spawn = (file, args, { cwd, env, cols, rows }) =>
  pty.spawn(file, args, { name: 'xterm-256color', cwd, env, cols, rows, useConpty: true });

const hooksPath = await writeHooksFile(dataDir);
const state = await loadState(stateFile);
const manager = new SessionManager({
  spawn,
  hooksPath,
  port,
  token,
  claudeBin: 'claude',
  shell: process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL ?? 'sh'),
});
manager.restore(state.sessions);

const staticDir = join(import.meta.dirname, '..', 'dist');
const srv = await createServer({
  manager,
  port,
  token,
  staticDir: existsSync(staticDir) ? staticDir : null,
  devPort: process.env.COLMENA_DEV === '1' ? 5173 : undefined,
  stateFile,
  recents: state.recents,
});
console.log(`Colmena en http://127.0.0.1:${srv.port}`);

const shutdown = async () => {
  manager.killAll();
  await srv.close(); // también guarda el estado // guarda el estado pendiente
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

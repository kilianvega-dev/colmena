// Verificación manual del apagado: ¿quedan procesos huérfanos al cerrar Colmena?
// Uso: node spike/shutdown-check.ts ctrl-c   (simula Ctrl+C en la consola)
//      node spike/shutdown-check.ts close    (simula cerrar la ventana de la consola)
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as pty from 'node-pty';
import WebSocket from 'ws';

const mode = process.argv[2] === 'close' ? 'close' : 'ctrl-c';
const port = 4799;
const appData = mkdtempSync(join(tmpdir(), 'colmena-shutdown-'));
const mark = `MARK${Date.now()}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Procesos que lanzó esta prueba: el nieto de la terminal lleva la marca; Claude lleva la ruta de hooks temporal.
const tmpName = appData.split(/[\\/]/).pop();
function survivors(): string[] {
  const ps = `Get-CimInstance Win32_Process | Where-Object { ($_.CommandLine -like '*${mark}*' -or $_.CommandLine -like '*${tmpName}*') -and $_.CommandLine -notlike '*Get-CimInstance*' } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`;
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

const server = pty.spawn(process.execPath, ['server/index.ts'], {
  cwd: join(import.meta.dirname, '..'),
  env: { ...process.env, APPDATA: appData, COLMENA_PORT: String(port) } as Record<string, string>,
  cols: 120, rows: 30, useConpty: true,
});
let out = '';
let exited = false;
server.onData((d) => (out += d));
server.onExit(() => (exited = true));

for (let i = 0; i < 40 && !out.includes('Colmena en'); i++) await sleep(250);
if (!out.includes('Colmena en')) throw new Error('El servidor no arrancó:\n' + out);

const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://127.0.0.1:${port}` });
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let terminalId = '';
ws.on('message', (raw) => {
  const m = JSON.parse(String(raw));
  if (m.type === 'session' && m.session.kind === 'terminal') terminalId = m.session.id;
});
ws.send(JSON.stringify({ type: 'create', kind: 'terminal', cwd: appData }));
ws.send(JSON.stringify({ type: 'create', kind: 'claude', cwd: appData }));
for (let i = 0; i < 20 && !terminalId; i++) await sleep(250);
await sleep(2500); // que PowerShell termine de arrancar
ws.send(JSON.stringify({ type: 'input', id: terminalId, data: `node -e "setInterval(()=>{},1000)" ${mark}\r` }));
await sleep(4000);

const before = survivors();
console.log(`Antes de apagar (${mode}): ${before.length} procesos de la prueba`, before);

const t0 = Date.now();
if (mode === 'ctrl-c') server.write('\x03');
else server.kill();
for (let i = 0; i < 40 && !exited; i++) await sleep(250);
console.log(`Servidor ${exited ? 'salió' : 'NO salió'} en ${Date.now() - t0} ms`);
await sleep(2000);

const after = survivors();
console.log(after.length ? `HUÉRFANOS (${after.length}):` : 'Sin huérfanos', after);
for (const line of after) {
  try { process.kill(Number(line.split(' ')[0])); } catch { /* ya salió */ }
}
ws.close();
process.exit(after.length ? 1 : 0);

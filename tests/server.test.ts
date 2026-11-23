import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import WebSocket from 'ws';
import { SessionManager } from '../server/sessions.ts';
import type { PtyLike, Spawn } from '../server/sessions.ts';
import { createServer } from '../server/server.ts';

const TOKEN = 'tok';
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function setup() {
  const ptys: (PtyLike & { emitData(d: string): void; write: any })[] = [];
  const spawn: Spawn = () => {
    let data: (d: string) => void = () => {};
    const p = {
      onData: (cb: any) => (data = cb),
      onExit: () => {},
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      emitData: (d: string) => data(d),
    };
    ptys.push(p);
    return p;
  };
  const manager = new SessionManager({ spawn, hooksPath: 'h.json', port: 0, token: TOKEN, claudeBin: 'claude', shell: 'sh' });
  const tmp = mkdtempSync(join(tmpdir(), 'colmena-srv-'));
  const srv = await createServer({ manager, port: 0, token: TOKEN, staticDir: null, stateFile: join(tmp, 's.json'), recents: [] });
  cleanups.push(srv.close);
  return { manager, ptys, tmp, srv };
}

function http(port: number, method: string, path: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode!));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function client(port: number, origin = `http://127.0.0.1:${port}`) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  const msgs: any[] = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
    ws.once('unexpected-response', () => rej(new Error('rechazado')));
  });
  cleanups.push(async () => ws.close());
  const waitFor = async (pred: (m: any) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const m = msgs.find(pred);
      if (m) return m;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timeout esperando mensaje');
  };
  return { ws, msgs, waitFor };
}

test('POST /hook: 401, 400, 404, 204 y el servidor sigue vivo', async () => {
  const { manager, srv, tmp } = await setup();
  const info = manager.create('claude', tmp);
  const h = { 'x-colmena-token': TOKEN };
  expect(await http(srv.port, 'POST', '/hook', {}, '{}')).toBe(401);
  expect(await http(srv.port, 'POST', '/hook', h, '{roto')).toBe(400);
  expect(await http(srv.port, 'POST', '/hook', h, JSON.stringify({ session_id: 'nada', hook_event_name: 'Stop' }))).toBe(404);
  expect(await http(srv.port, 'POST', '/hook', h, JSON.stringify({ session_id: info.id, hook_event_name: 'Stop' }))).toBe(204);
  expect(manager.list()[0].status).toBe('terminado');
  expect(await http(srv.port, 'GET', '/')).toBe(404);
});

test('Host y Origin ajenos se rechazan', async () => {
  const { srv } = await setup();
  expect(await http(srv.port, 'GET', '/', { host: 'evil.com' })).toBe(403);
  await expect(client(srv.port, 'https://evil.com')).rejects.toThrow();
});

test('dos clientes: snapshot inicial, session, output e input', async () => {
  const { srv, ptys, tmp } = await setup();
  const a = await client(srv.port);
  const b = await client(srv.port);
  await a.waitFor((m) => m.type === 'snapshot');
  expect(a.msgs[0].type).toBe('snapshot');
  a.ws.send(JSON.stringify({ type: 'create', kind: 'terminal', cwd: tmp }));
  const sa = await a.waitFor((m) => m.type === 'session');
  await b.waitFor((m) => m.type === 'session');
  ptys[0].emitData('hola');
  await a.waitFor((m) => m.type === 'output' && m.data === 'hola');
  await b.waitFor((m) => m.type === 'output' && m.data === 'hola');
  b.ws.send(JSON.stringify({ type: 'input', id: sa.session.id, data: 'ls' }));
  await vi.waitFor(() => expect(ptys[0].write).toHaveBeenCalledWith('ls'));
});

test('create con carpeta inexistente: error solo a ese cliente', async () => {
  const { srv } = await setup();
  const a = await client(srv.port);
  const b = await client(srv.port);
  await b.waitFor((m) => m.type === 'snapshot');
  a.ws.send(JSON.stringify({ type: 'create', kind: 'terminal', cwd: join(tmpdir(), 'no-existe-xyz') }));
  await a.waitFor((m) => m.type === 'error');
  await new Promise((r) => setTimeout(r, 50));
  expect(b.msgs.some((m) => m.type === 'error')).toBe(false);
});

test('el orden guardado se respeta, filtra fantasmas y añade faltantes', async () => {
  const { manager, tmp } = await setup();
  const m2 = new SessionManager({ spawn: (() => { throw new Error('x'); }) as Spawn, hooksPath: 'h', port: 0, token: TOKEN, claudeBin: 'c', shell: 's' });
  m2.restore([{ id: 'A', kind: 'terminal', cwd: tmp }, { id: 'B', kind: 'terminal', cwd: tmp }, { id: 'C', kind: 'terminal', cwd: tmp }]);
  const srv = await createServer({ manager: m2, port: 0, token: TOKEN, staticDir: null, stateFile: join(tmp, 'o.json'), recents: [], order: ['B', 'A', 'ghost'] });
  cleanups.push(srv.close);
  const c = await client(srv.port);
  const snap = await c.waitFor((m) => m.type === 'snapshot');
  expect(snap.order).toEqual(['B', 'A', 'C']);
  void manager;
});

test('upgrade con Host ajeno se rechaza', async () => {
  const { srv } = await setup();
  const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`, { origin: `http://127.0.0.1:${srv.port}`, headers: { host: `evil.com:${srv.port}` } });
  await new Promise<void>((res, rej) => {
    ws.once('open', () => rej(new Error('abierto')));
    ws.once('error', () => res());
  });
});

test('POST /hook con cuerpo > 64 KB da 413', async () => {
  const { srv } = await setup();
  expect(await http(srv.port, 'POST', '/hook', { 'x-colmena-token': TOKEN }, 'x'.repeat(70_000))).toBe(413);
});

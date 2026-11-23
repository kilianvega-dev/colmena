import { createServer as createHttp } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { SessionManager } from './sessions.ts';
import type { ClientMessage, ServerMessage } from './protocol.ts';
import { parseHookPayload } from './hooks.ts';
import { isAllowedHost, isAllowedOrigin } from './security.ts';
import { addRecent, saveState } from './store.ts';

interface Opts {
  manager: SessionManager;
  port: number;
  token: string;
  staticDir: string | null;
  devPort?: number;
  stateFile: string;
  recents: string[];
  order?: string[];
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

export async function createServer(opts: Opts): Promise<{ close(): Promise<void>; port: number }> {
  const { manager, token, staticDir, devPort, stateFile } = opts;
  let recents = opts.recents;
  const ids = manager.list().map((s) => s.id);
  const saved = (opts.order ?? []).filter((id) => ids.includes(id));
  let order: string[] = [...saved, ...ids.filter((id) => !saved.includes(id))];
  let port = opts.port;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const send = (ws: WebSocket, m: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const broadcast = (m: ServerMessage) => wss.clients.forEach((c) => send(c, m));
  const snapshot = (): ServerMessage => ({ type: 'snapshot', sessions: manager.list(), order, recents });

  let timer: NodeJS.Timeout | null = null;
  const persist = async () => {
    const sessions = manager.list().map(({ id, kind, cwd }) => ({ id, kind, cwd }));
    await saveState(stateFile, { sessions, order, recents }).catch((e) => console.error('No se pudo guardar el estado:', e));
  };
  const schedule = () => {
    timer ??= setTimeout(() => {
      timer = null;
      void persist();
    }, 300);
  };

  manager.on('session', (session) => {
    if (!order.includes(session.id)) order = [...order, session.id];
    broadcast({ type: 'session', session });
    schedule();
  });
  manager.on('output', (id, data) => broadcast({ type: 'output', id, data }));
  manager.on('removed', (id) => {
    order = order.filter((x) => x !== id);
    broadcast({ type: 'removed', id });
    schedule();
  });

  function handle(ws: WebSocket, msg: ClientMessage) {
    try {
      switch (msg.type) {
        case 'create': {
          manager.create(msg.kind, msg.cwd);
          recents = addRecent(recents, msg.cwd);
          broadcast(snapshot());
          schedule();
          break;
        }
        case 'resume': manager.resume(msg.id); break;
        case 'close': manager.close(msg.id); break;
        case 'remove': manager.remove(msg.id); break;
        case 'input': manager.write(msg.id, msg.data); break;
        case 'resize': manager.resize(msg.id, msg.cols, msg.rows); break;
        case 'reorder': {
          const known = new Set(manager.list().map((s) => s.id));
          order = msg.ids.filter((id) => known.has(id));
          schedule();
          break;
        }
      }
    } catch (e) {
      send(ws, { type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  wss.on('connection', (ws) => {
    send(ws, snapshot());
    for (const s of manager.list()) send(ws, { type: 'replay', id: s.id, data: manager.replay(s.id) });
    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg && typeof msg === 'object') handle(ws, msg);
    });
  });

  async function serveStatic(url: string, res: ServerResponse) {
    if (!staticDir) return end(res, 404);
    const root = resolve(staticDir);
    let path: string;
    try {
      path = decodeURIComponent(new URL(url, 'http://x').pathname);
    } catch {
      return end(res, 400);
    }
    let file = resolve(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return end(res, 403);
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      file = join(root, 'index.html');
      try {
        data = await readFile(file);
      } catch {
        return end(res, 404);
      }
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  }

  function end(res: ServerResponse, code: number) {
    res.writeHead(code).end();
  }

  function hook(req: IncomingMessage, res: ServerResponse) {
    if (req.headers['x-colmena-token'] !== token) {
      req.resume();
      return end(res, 401);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 65536) tooBig = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return end(res, 413);
      let parsed = null;
      try {
        parsed = parseHookPayload(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {}
      if (!parsed) return end(res, 400);
      end(res, manager.applyHook(parsed.sessionId, parsed.event) ? 204 : 404);
    });
  }

  const server = createHttp((req, res) => {
    if (!isAllowedHost(req.headers.host, port)) return end(res, 403);
    if (req.method === 'POST' && req.url === '/hook') return hook(req, res);
    if (req.method === 'GET') return void serveStatic(req.url ?? '/', res);
    end(res, 404);
  });

  server.on('upgrade', (req, socket, head) => {
    const ok =
      req.url === '/ws' &&
      isAllowedHost(req.headers.host, port) &&
      isAllowedOrigin(req.headers.origin, port, devPort);
    if (!ok) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  await new Promise<void>((res, rej) => {
    server.once('error', rej);
    server.listen(opts.port, '127.0.0.1', res);
  });
  port = (server.address() as AddressInfo).port;

  return {
    port,
    async close() {
      if (timer) clearTimeout(timer);
      timer = null;
      await persist();
      wss.clients.forEach((c) => c.terminate());
      server.closeAllConnections();
      await new Promise<void>((res) => server.close(() => res()));
    },
  };
}

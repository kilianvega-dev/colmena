import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOOK_EVENTS, parseHookPayload, writeHooksFile } from '../server/hooks.ts';

const relay = fileURLToPath(new URL('../server/hook-relay.cjs', import.meta.url));

function runRelay(port: number | string, stdin: string) {
  return new Promise<{ code: number | null; out: string; ms: number }>((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [relay], {
      env: { ...process.env, COLMENA_PORT: String(port), COLMENA_TOKEN: 'tok' },
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out, ms: Date.now() - t0 }));
    p.stdin.end(stdin);
  });
}

describe('writeHooksFile', () => {
  it('escribe los 7 eventos con el comando del relay', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'colmena-'));
    const file = await writeHooksFile(join(dir, 'data'));
    const json = JSON.parse(await readFile(file, 'utf8'));
    expect(Object.keys(json.hooks)).toEqual([...HOOK_EVENTS]);
    for (const ev of HOOK_EVENTS) {
      const cmd: string = json.hooks[ev][0].hooks[0].command;
      expect(cmd).toMatch(/^node ".*hook-relay\.cjs"$/);
      expect(cmd).not.toContain('\\');
    }
  });
});

describe('parseHookPayload', () => {
  it('lee session_id y hook_event_name', () => {
    expect(parseHookPayload({ session_id: 'a', hook_event_name: 'Stop' })).toEqual({
      sessionId: 'a',
      event: 'Stop',
    });
  });
  it('devuelve null si es inválido', () => {
    expect(parseHookPayload({})).toBeNull();
    expect(parseHookPayload('x')).toBeNull();
    expect(parseHookPayload(null)).toBeNull();
  });
});

describe('hook-relay.cjs', () => {
  it('reenvía cuerpo y token al servidor', async () => {
    let got = { body: '', token: '' };
    let gotSession = 'x';
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        got = { body, token: String(req.headers['x-colmena-token']) };
        gotSession = String(req.headers['x-colmena-session']);
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const payload = '{"session_id":"a","hook_event_name":"Stop"}';
    const r = await runRelay(port, payload);
    server.close();
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(got).toEqual({ body: payload, token: 'tok' });
    expect(gotSession).toBe('');
  });

  it('sale con 0 y rápido sin servidor', async () => {
    const r = await runRelay(1, '{"session_id":"a","hook_event_name":"Stop"}');
    expect(r.code).toBe(0);
    expect(r.out).toBe('');
    expect(r.ms).toBeLessThan(3000);
  });
});

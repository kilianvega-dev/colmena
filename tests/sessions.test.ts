import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager, cleanEnv } from '../server/sessions.ts';
import type { PtyLike, Spawn } from '../server/sessions.ts';

function setup() {
  const calls: { file: string; args: string[]; opts: any }[] = [];
  const ptys: (PtyLike & { emitData(d: string): void; emitExit(e: { exitCode: number }): void; kill: any })[] = [];
  const spawn: Spawn = (file, args, opts) => {
    calls.push({ file, args, opts });
    let data: (d: string) => void = () => {};
    let exit: (e: { exitCode: number }) => void = () => {};
    const p = {
      onData: (cb: any) => (data = cb),
      onExit: (cb: any) => (exit = cb),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
      emitData: (d: string) => data(d),
      emitExit: (e: { exitCode: number }) => exit(e),
    };
    ptys.push(p);
    return p;
  };
  const m = new SessionManager({ spawn, hooksPath: 'h.json', port: 1234, token: 'tok', claudeBin: 'claude.exe', shell: 'powershell.exe' });
  const tmp = mkdtempSync(join(tmpdir(), 'colmena-'));
  return { m, calls, ptys, tmp };
}

test('create claude lanza claude con session-id y env', () => {
  const { m, calls, tmp } = setup();
  const info = m.create('claude', tmp);
  expect(info.status).toBe('iniciando');
  expect(calls[0].file).toBe('claude.exe');
  expect(calls[0].args).toEqual(['--session-id', info.id, '--settings', 'h.json']);
  expect(calls[0].opts.env.COLMENA_TOKEN).toBe('tok');
  expect(calls[0].opts.env.COLMENA_PORT).toBe('1234');
  expect(calls[0].opts.env.COLMENA_SESSION).toBe(info.id);
  expect(calls[0].opts.cols).toBe(120);
});

test('cwd con espacios y acentos se pasa tal cual; carpeta inexistente falla', () => {
  const { m, calls, tmp } = setup();
  const dir = join(tmp, 'Proyecto Kílian con espacios');
  mkdirSync(dir);
  m.create('terminal', dir);
  expect(calls[0].opts.cwd).toBe(dir);
  expect(calls[0].file).toBe('powershell.exe');
  expect(() => m.create('claude', 'C:\\no\\existe')).toThrow('La carpeta no existe');
  expect(calls).toHaveLength(1);
});

test('applyHook cambia estado y emite; id desconocido da false', () => {
  const { m, tmp } = setup();
  const info = m.create('claude', tmp);
  const seen: string[] = [];
  m.on('session', (s) => seen.push(s.status));
  expect(m.applyHook(info.id, 'UserPromptSubmit')).toBe(true);
  expect(seen).toEqual(['trabajando']);
  expect(m.applyHook('desconocido', 'Stop')).toBe(false);
});

test('salida inmediata deja la sesión cerrada con exitCode', () => {
  const { m, ptys, tmp } = setup();
  const info = m.create('claude', tmp);
  ptys[0].emitExit({ exitCode: 1 });
  expect(m.list()[0]).toMatchObject({ id: info.id, status: 'cerrado', exitCode: 1 });
});

test('resume de claude cerrada usa --resume; terminal lanza error', () => {
  const { m, calls, ptys, tmp } = setup();
  const c = m.create('claude', tmp);
  const t = m.create('terminal', tmp);
  ptys[0].emitExit({ exitCode: 0 });
  ptys[1].emitExit({ exitCode: 0 });
  const r = m.resume(c.id);
  expect(r.status).toBe('iniciando');
  expect(calls[2].args).toEqual(['--resume', c.id, '--settings', 'h.json']);
  expect(() => m.resume(t.id)).toThrow();
  ptys[0].emitData('viejo'); // pty reemplazado: se ignora
  expect(m.replay(c.id)).toBe('');
});

test('la salida queda en replay y killAll mata los vivos', async () => {
  const { m, ptys, tmp } = setup();
  const a = m.create('claude', tmp);
  m.create('terminal', tmp);
  ptys[0].emitData('hola');
  expect(m.replay(a.id)).toBe('hola');
  const done = m.killAll();
  expect(ptys[0].kill).toHaveBeenCalled();
  expect(ptys[1].kill).toHaveBeenCalled();
  ptys[0].emitExit({ exitCode: 0 });
  ptys[1].emitExit({ exitCode: 0 });
  await done; // resuelve al llegar todos los onExit
});

test('restore registra cerradas sin lanzar; remove emite removed', () => {
  const { m, calls, tmp } = setup();
  m.restore([{ id: 'x', kind: 'claude', cwd: tmp }]);
  expect(calls).toHaveLength(0);
  expect(m.list()[0].status).toBe('cerrado');
  const ids: string[] = [];
  m.on('removed', (id) => ids.push(id));
  m.remove('x');
  expect(ids).toEqual(['x']);
  expect(m.list()).toEqual([]);
});

function throwingSetup(tmp: string, state: { fail: boolean; killFails?: boolean }) {
  const spawn: Spawn = () => {
    if (state.fail) throw new Error('spawn falló');
    return {
      onData: () => {},
      onExit: () => {},
      write: () => {},
      resize: () => {},
      kill: () => {
        if (state.killFails) throw new Error('kill falló');
      },
    };
  };
  return new SessionManager({ spawn, hooksPath: 'h.json', port: 1, token: 't', claudeBin: 'c', shell: 's' });
}

test('create con spawn que lanza no deja sesión fantasma', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'colmena-'));
  const m = throwingSetup(tmp, { fail: true });
  const seen: unknown[] = [];
  m.on('session', (s) => seen.push(s));
  expect(() => m.create('claude', tmp)).toThrow('spawn falló');
  expect(m.list()).toEqual([]);
  expect(seen).toEqual([]);
});

test('resume con spawn que lanza deja cerrado, emite y relanza', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'colmena-'));
  const m = throwingSetup(tmp, { fail: false });
  m.restore([{ id: 'x', kind: 'claude', cwd: tmp }]);
  const state = (m as any).opts as any;
  const seen: string[] = [];
  m.on('session', (s) => seen.push(s.status));
  state.spawn = () => {
    throw new Error('spawn falló');
  };
  expect(() => m.resume('x')).toThrow('spawn falló');
  expect(m.list()[0]).toMatchObject({ status: 'cerrado', exitCode: null });
  expect(seen).toContain('cerrado');
});

test('remove y close con kill que lanza no propagan y remove emite removed', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'colmena-'));
  const m = throwingSetup(tmp, { fail: false, killFails: true });
  const a = m.create('terminal', tmp);
  const ids: string[] = [];
  m.on('removed', (id) => ids.push(id));
  expect(() => m.close(a.id)).not.toThrow();
  expect(() => m.remove(a.id)).not.toThrow();
  expect(ids).toEqual([a.id]);
});

test('cleanEnv quita variables de la sesión anfitriona y conserva las de usuario', () => {
  const env = {
    CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_CODE_MESSAGING_TOKEN: 't',
    CLAUDE_AGENT_SDK_VERSION: '1', CLAUDE_CODE_USE_BEDROCK: '1', PATH: 'p',
  };
  expect(cleanEnv(env)).toEqual({ CLAUDE_CODE_USE_BEDROCK: '1', PATH: 'p' });
});

test('create no hereda CLAUDECODE en el env del hijo', () => {
  const { m, calls, tmp } = setup();
  process.env.CLAUDECODE = '1';
  try {
    m.create('claude', tmp);
    m.create('terminal', tmp);
  } finally {
    delete process.env.CLAUDECODE;
  }
  expect(calls[0].opts.env.CLAUDECODE).toBeUndefined();
  expect(calls[1].opts.env.CLAUDECODE).toBeUndefined();
});

test('SessionEnd no cierra la sesión', () => {
  const { m, tmp } = setup();
  const info = m.create('claude', tmp);
  m.applyHook(info.id, 'UserPromptSubmit');
  m.applyHook(info.id, 'SessionEnd');
  expect(m.list()[0].status).toBe('trabajando');
});

test('resume usa el último session_id reportado por Claude', () => {
  const { m, calls, ptys, tmp } = setup();
  const info = m.create('claude', tmp);
  m.applyHook(info.id, 'UserPromptSubmit', 'otro-uuid');
  m.close(info.id);
  ptys[0].emitExit({ exitCode: 0 });
  m.resume(info.id);
  expect(calls[1].args.slice(0, 2)).toEqual(['--resume', 'otro-uuid']);
});

test('resume con pty vivo lanza y no llama a spawn', () => {
  const { m, calls, tmp } = setup();
  const info = m.create('claude', tmp);
  expect(() => m.resume(info.id)).toThrow('La sesión sigue abierta');
  expect(calls).toHaveLength(1);
});

test('sin CLAUDECODE se respeta todo el entorno del usuario', () => {
  const { m, calls, tmp } = setup();
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  try {
    m.create('claude', tmp);
  } finally {
    delete process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
  }
  expect(calls[0].opts.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
});

// #1
test('un resumeId nuevo emite session aunque el estado no cambie', () => {
  const { m, tmp } = setup();
  const info = m.create('claude', tmp);
  m.applyHook(info.id, 'UserPromptSubmit', 'a');
  const seen: unknown[] = [];
  m.on('session', (s) => seen.push(s));
  m.applyHook(info.id, 'PreToolUse', 'b');
  expect(seen).toHaveLength(1);
  m.applyHook(info.id, 'PreToolUse', 'b');
  expect(seen).toHaveLength(1);
});

// #2
test('killAll no espera a una sesión quitada durante el apagado', async () => {
  const { m, tmp } = setup();
  const info = m.create('terminal', tmp);
  const t0 = Date.now();
  const done = m.killAll();
  m.remove(info.id);
  await done;
  expect(Date.now() - t0).toBeLessThan(1000);
});

// #3
test('resume que falla conserva la salida anterior', () => {
  const { m, ptys, tmp } = setup();
  const info = m.create('claude', tmp);
  ptys[0].emitData('salida vieja');
  m.close(info.id);
  ptys[0].emitExit({ exitCode: 0 });
  (m as any).opts.spawn = () => { throw new Error('spawn falló'); };
  expect(() => m.resume(info.id)).toThrow('spawn falló');
  expect(m.replay(info.id)).toBe('salida vieja');
});

// #4
test('rename pone el nombre, recorta espacios y emite session', () => {
  const { m, tmp } = setup();
  const info = m.create('terminal', tmp);
  const seen: any[] = [];
  m.on('session', (s) => seen.push(s));
  m.rename(info.id, '  servidor dev  ');
  expect(m.list()[0].name).toBe('servidor dev');
  expect(seen.at(-1).name).toBe('servidor dev');
});

test('rename con nombre vacío vuelve al nombre de la carpeta', () => {
  const { m, tmp } = setup();
  const info = m.create('terminal', tmp);
  m.rename(info.id, 'algo');
  m.rename(info.id, '   ');
  expect(m.list()[0].name).toBeUndefined();
});

test('rename corta nombres de más de 60 caracteres', () => {
  const { m, tmp } = setup();
  const info = m.create('terminal', tmp);
  m.rename(info.id, 'x'.repeat(80));
  expect(m.list()[0].name).toHaveLength(60);
});

test('restore conserva el nombre guardado', () => {
  const { m, tmp } = setup();
  m.restore([{ id: 'x', kind: 'claude', cwd: tmp, name: 'backend' }]);
  expect(m.list()[0].name).toBe('backend');
});

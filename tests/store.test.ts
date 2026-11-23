import { mkdtemp, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState, addRecent } from '../server/store.ts';

const tmp = async () => join(await mkdtemp(join(tmpdir(), 'colmena-')), 'sub', 'state.json');

describe('store', () => {
  it('guarda y carga lo mismo', async () => {
    const f = await tmp();
    const s = { sessions: [{ id: 'a', kind: 'claude' as const, cwd: 'C:\\a' }], order: ['a'], recents: ['C:\\a'] };
    await saveState(f, s);
    expect(await loadState(f)).toEqual(s);
  });
  it('archivo ausente da estado vacío sin .bak', async () => {
    const f = await tmp();
    expect(await loadState(f)).toEqual({ sessions: [], order: [], recents: [] });
    await expect(access(f + '.bak')).rejects.toThrow();
  });
  it('archivo roto da estado vacío y deja .bak', async () => {
    const f = await tmp();
    await saveState(f, { sessions: [], order: [], recents: [] });
    await writeFile(f, '{roto');
    expect(await loadState(f)).toEqual({ sessions: [], order: [], recents: [] });
    expect(await readFile(f + '.bak', 'utf8')).toBe('{roto');
  });
  it('forma incorrecta se trata como roto', async () => {
    const f = await tmp();
    await saveState(f, { sessions: [], order: [], recents: [] });
    await writeFile(f, '{"sessions":1}');
    expect(await loadState(f)).toEqual({ sessions: [], order: [], recents: [] });
    expect(await readFile(f + '.bak', 'utf8')).toBe('{"sessions":1}');
  });
  it('addRecent', () => {
    expect(addRecent(['C:\\a', 'C:\\B'], 'c:\\b')).toEqual(['c:\\b', 'C:\\a']);
    const r = Array.from({ length: 11 }, (_, i) => 'C:\\d' + i).reduce<string[]>((a, c) => addRecent(a, c), []);
    expect(r).toHaveLength(10);
  });
});

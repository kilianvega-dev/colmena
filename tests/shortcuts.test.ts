import { moved, shortcutFor } from '../web/shortcuts.ts';

const key = (code: string, mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) =>
  ({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

test('Alt+N abre una sesión nueva', () => {
  expect(shortcutFor(key('KeyN', { altKey: true }))).toEqual({ type: 'new' });
});

test('Alt+1…9 enfoca el panel por posición (base 0)', () => {
  expect(shortcutFor(key('Digit1', { altKey: true }))).toEqual({ type: 'focus', index: 0 });
  expect(shortcutFor(key('Digit9', { altKey: true }))).toEqual({ type: 'focus', index: 8 });
});

test('las teclas del teclado numérico también sirven', () => {
  expect(shortcutFor(key('Numpad3', { altKey: true }))).toEqual({ type: 'focus', index: 2 });
});

test('sin Alt, o con otro modificador, no es atajo (la terminal la recibe)', () => {
  expect(shortcutFor(key('KeyN'))).toBeNull();
  expect(shortcutFor(key('Digit1', { ctrlKey: true }))).toBeNull();
  expect(shortcutFor(key('KeyN', { altKey: true, ctrlKey: true }))).toBeNull(); // AltGr en Windows = Ctrl+Alt
  expect(shortcutFor(key('KeyN', { altKey: true, shiftKey: true }))).toBeNull();
  expect(shortcutFor(key('Digit0', { altKey: true }))).toBeNull();
});

test('Alt+Shift+flechas mueve el panel enfocado', () => {
  expect(shortcutFor(key('ArrowLeft', { altKey: true, shiftKey: true }))).toEqual({ type: 'move', delta: -1 });
  expect(shortcutFor(key('ArrowRight', { altKey: true, shiftKey: true }))).toEqual({ type: 'move', delta: 1 });
  expect(shortcutFor(key('ArrowRight', { altKey: true }))).toBeNull();
});

test('moved: el panel ocupa el lugar del objetivo', () => {
  expect(moved(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  expect(moved(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  expect(moved(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
});

test('moved: fuera de rango se queda en el borde y un id desconocido no cambia nada', () => {
  expect(moved(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
  expect(moved(['a', 'b', 'c'], 'c', 9)).toEqual(['a', 'b', 'c']);
  expect(moved(['a', 'b'], 'x', 0)).toEqual(['a', 'b']);
});

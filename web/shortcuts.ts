// Alt y no Ctrl: Chrome no deja capturar Ctrl+N ni Ctrl+1…9, y la terminal necesita Ctrl+letra.
export type Shortcut = { type: 'new' } | { type: 'focus'; index: number };

type KeyLike = Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function shortcutFor(e: KeyLike): Shortcut | null {
  // Ctrl+Alt es AltGr en Windows (@, #, etc.): nunca es atajo
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.code === 'KeyN') return { type: 'new' };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return digit ? { type: 'focus', index: Number(digit[1]) - 1 } : null;
}

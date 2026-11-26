// Alt y no Ctrl: Chrome no deja capturar Ctrl+N ni Ctrl+1…9, y la terminal necesita Ctrl+letra.
export type Shortcut = { type: 'new' } | { type: 'focus'; index: number } | { type: 'move'; delta: -1 | 1 };

type KeyLike = Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;

export function shortcutFor(e: KeyLike): Shortcut | null {
  // Ctrl+Alt es AltGr en Windows (@, #, etc.): nunca es atajo
  if (!e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.shiftKey) {
    if (e.code === 'ArrowLeft') return { type: 'move', delta: -1 };
    if (e.code === 'ArrowRight') return { type: 'move', delta: 1 };
    return null;
  }
  if (e.code === 'KeyN') return { type: 'new' };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  return digit ? { type: 'focus', index: Number(digit[1]) - 1 } : null;
}

// Saca `id` y lo pone en la posición `to` (el panel ocupa el lugar del objetivo).
export function moved(ids: string[], id: string, to: number): string[] {
  if (!ids.includes(id)) return ids;
  const rest = ids.filter((x) => x !== id);
  const at = Math.max(0, Math.min(to, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

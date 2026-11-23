import type { SessionStatus } from './protocol.ts';

const porEvento = new Map<string, SessionStatus>([
  ['SessionStart', 'iniciando'],
  ['UserPromptSubmit', 'trabajando'],
  ['PreToolUse', 'trabajando'],
  ['Notification', 'esperando'],
  ['Stop', 'terminado'],
  ['SessionEnd', 'cerrado'],
]);

// cerrado solo sale con "reanudar" (Tarea 6), así que los hooks no lo cambian
export function nextStatus(current: SessionStatus, hookEvent: string): SessionStatus {
  if (current === 'cerrado') return 'cerrado';
  return porEvento.get(hookEvent) ?? current;
}

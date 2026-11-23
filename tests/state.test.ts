import { nextStatus } from '../server/state.ts';
import type { SessionStatus } from '../server/protocol.ts';
test.each([
  ['iniciando', 'UserPromptSubmit', 'trabajando'],
  ['terminado', 'PreToolUse', 'trabajando'],
  ['trabajando', 'Notification', 'esperando'],
  ['esperando', 'PreToolUse', 'trabajando'],
  ['trabajando', 'Stop', 'terminado'],
  ['trabajando', 'SessionEnd', 'cerrado'],
  ['iniciando', 'SessionStart', 'iniciando'],
  ['trabajando', 'EventoDesconocido', 'trabajando'],
  ['cerrado', 'UserPromptSubmit', 'cerrado'],
])('%s + %s -> %s', (from, ev, to) => expect(nextStatus(from as SessionStatus, ev)).toBe(to));

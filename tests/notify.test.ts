import { describe, expect, it } from 'vitest';
import { titleFor, waitingCount } from '../web/notify.ts';
import type { SessionInfo } from '../server/protocol.ts';

const s = (id: string, status: SessionInfo['status']): SessionInfo => ({ id, kind: 'claude', cwd: 'C:/x', status, exitCode: null });

describe('notify', () => {
  it('titleFor', () => {
    expect(titleFor(0)).toBe('Colmena');
    expect(titleFor(2)).toBe('(2) Colmena');
  });
  it('waitingCount cuenta solo esperando', () => {
    expect(waitingCount([s('a', 'esperando'), s('b', 'trabajando'), s('c', 'esperando')])).toBe(2);
  });
});

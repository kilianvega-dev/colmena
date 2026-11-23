import type { SessionInfo } from '../server/protocol.ts';

export const waitingCount = (sessions: SessionInfo[]): number =>
  sessions.filter((s) => s.status === 'esperando').length;

export const titleFor = (count: number): string => (count > 0 ? `(${count}) Colmena` : 'Colmena');

// Los globals del navegador solo se tocan dentro de la función, para poder importar el archivo en Vitest.
export function notifyWaiting(s: SessionInfo): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch { /* sin audio disponible */ }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    const name = s.cwd.split(/[\\/]/).filter(Boolean).pop() ?? s.cwd;
    new Notification('Colmena', { body: `${name} está esperando` });
  }
}

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'Notification',
  'Stop',
  'SessionEnd',
] as const;

export async function writeHooksFile(dataDir: string): Promise<string> {
  const relay = join(import.meta.dirname, 'hook-relay.cjs').replaceAll('\\', '/');
  const command = `node "${relay}"`;
  const hooks = Object.fromEntries(
    HOOK_EVENTS.map((e) => [e, [{ hooks: [{ type: 'command', command }] }]]),
  );
  await mkdir(dataDir, { recursive: true });
  const file = join(dataDir, 'hooks.json');
  await writeFile(file, JSON.stringify({ hooks }, null, 2));
  return file;
}

export function parseHookPayload(body: unknown): { sessionId: string; event: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { session_id, hook_event_name } = body as Record<string, unknown>;
  if (typeof session_id !== 'string' || typeof hook_event_name !== 'string') return null;
  return { sessionId: session_id, event: hook_event_name };
}

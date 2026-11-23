export type SessionKind = 'claude' | 'terminal';
export type SessionStatus = 'iniciando' | 'trabajando' | 'esperando' | 'terminado' | 'cerrado';
export interface SessionInfo { id: string; kind: SessionKind; cwd: string; status: SessionStatus; exitCode: number | null; }

export type ClientMessage =
  | { type: 'create'; kind: SessionKind; cwd: string }
  | { type: 'resume'; id: string }
  | { type: 'close'; id: string }      // mata el proceso, conserva el panel
  | { type: 'remove'; id: string }     // quita el panel (mata si vive)
  | { type: 'input'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'reorder'; ids: string[] };

export type ServerMessage =
  | { type: 'snapshot'; sessions: SessionInfo[]; order: string[]; recents: string[] }
  | { type: 'session'; session: SessionInfo }
  | { type: 'output'; id: string; data: string }
  | { type: 'replay'; id: string; data: string }
  | { type: 'removed'; id: string }
  | { type: 'error'; message: string };

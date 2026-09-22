export type GameStatus = 'InProgress' | 'Completed';

export interface Player {
  id: string;
  name: string;
}

export interface ScoreEvent {
  id: string;
  playerId: string;
  points: number;
  roundNumber?: number | null;
  timestamp: string;
}

export interface Game {
  id: string;
  /** Short code others enter to join this game (e.g. "K7M2QX"). */
  shareCode: string;
  name: string;
  templateId: string;
  players: Player[];
  events: ScoreEvent[];
  status: GameStatus;
  targetScore?: number | null;
  maxRounds?: number | null;
  createdAt: string;
  updatedAt: string;
}

export function createPlayer(name: string): Player {
  return { id: cryptoRandomId(), name };
}

export function createScoreEvent(
  playerId: string,
  points: number,
  roundNumber?: number | null,
): ScoreEvent {
  return {
    id: cryptoRandomId(),
    playerId,
    points,
    roundNumber: roundNumber ?? null,
    timestamp: new Date().toISOString(),
  };
}

export function createGame(partial: {
  name: string;
  templateId: string;
  players: Player[];
  targetScore?: number | null;
  maxRounds?: number | null;
}): Game {
  const now = new Date().toISOString();
  return {
    id: cryptoRandomId(),
    shareCode: generateShareCode(),
    name: partial.name,
    templateId: partial.templateId,
    players: partial.players,
    events: [],
    status: 'InProgress',
    targetScore: partial.targetScore ?? null,
    maxRounds: partial.maxRounds ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Unambiguous alphabet (no 0/O, 1/I/L) for easy verbal sharing. */
const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateShareCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * SHARE_CODE_ALPHABET.length);
    code += SHARE_CODE_ALPHABET[idx];
  }
  return code;
}

export function normalizeShareCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
}

function cryptoRandomId(): string {
  // Works on web and modern RN; fallback for older runtimes
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

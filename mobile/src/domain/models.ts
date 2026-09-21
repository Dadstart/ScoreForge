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

import type { CheckersState } from './checkers';
import type { ChineseState } from './chineseCheckers';
import type { KlondikeState } from './klondike';
import type { PyramidState } from './pyramid';
import type { SorryState } from './sorry';

export type GameStatus = 'InProgress' | 'Completed';

export interface Player {
  id: string;
  name: string;
  /** Monopoly piece id. Absent means the initial circle. */
  token?: string | null;
}

export interface ScoreEvent {
  id: string;
  playerId: string;
  points: number;
  roundNumber?: number | null;
  /** Yahtzee score-card box id. The latest event for a player and box is the score. */
  box?: string | null;
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
  /** Board space index (0 is Go) for each player id. */
  tokenSpaces?: Record<string, number>;
  /** Shared Sorry board, deck, and turn. */
  sorry?: SorryState | null;
  /** Shared checkers board and turn. */
  checkers?: CheckersState | null;
  /** Shared Chinese checkers star, seats, and turn. */
  chinese?: ChineseState | null;
  /** Klondike layout, stock, and undo. */
  klondike?: KlondikeState | null;
  /** Pyramid layout, stock, and undo. */
  pyramid?: PyramidState | null;
  /**
   * Increments on every successful save. A write is stored only when it was
   * based on this revision, so two devices cannot overwrite each other.
   */
  revision: number;
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
  box?: string | null,
): ScoreEvent {
  const event: ScoreEvent = {
    id: cryptoRandomId(),
    playerId,
    points,
    roundNumber: roundNumber ?? null,
    timestamp: new Date().toISOString(),
  };
  if (box) event.box = box;
  return event;
}

export function createGame(partial: {
  name: string;
  templateId: string;
  players: Player[];
  targetScore?: number | null;
  maxRounds?: number | null;
}): Game {
  const now = new Date().toISOString();
  const shareCode = generateShareCode();
  return {
    id: shareCode,
    shareCode,
    name: partial.name,
    templateId: partial.templateId,
    players: partial.players,
    events: [],
    status: 'InProgress',
    targetScore: partial.targetScore ?? null,
    maxRounds: partial.maxRounds ?? null,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Unambiguous alphabet (no 0/O, 1/I/L) for easy verbal sharing. */
export const SHARE_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SHARE_CODE_LENGTH = 6;

export function isShareCode(code: string): boolean {
  if (code.length !== SHARE_CODE_LENGTH) return false;
  for (const char of code) {
    if (!SHARE_CODE_ALPHABET.includes(char)) return false;
  }
  return true;
}

/** Cryptographic share code. 32 symbols and a multiple of the byte range, so modulo is unbiased. */
export function generateShareCode(): string {
  const bytes = new Uint8Array(SHARE_CODE_LENGTH);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Secure random numbers are not available on this device.');
  }
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_CODE_ALPHABET[bytes[i] % SHARE_CODE_ALPHABET.length];
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

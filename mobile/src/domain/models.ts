import type { BackgammonState } from './backgammon';
import type { CheckersState } from './checkers';
import type { ChineseState } from './chineseCheckers';
import type { KlondikeState } from './klondike';
import type { PyramidState } from './pyramid';
import type { SpiderState } from './spider';
import type { TriPeaksState } from './tripeaks';
import type { SorryState } from './sorry';
import type { MonopolyPlay } from './monopolyPlay';
import type { YahtzeeState } from './yahtzee';
import { fillRandom, randomId } from './secureRandom';

export type GameStatus = 'InProgress' | 'Completed';

export interface Player {
  id: string;
  name: string;
  /** Monopoly piece id, or a custom emoji. Absent means the initial circle. */
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
  /** Shared backgammon board, dice, and cube. */
  backgammon?: BackgammonState | null;
  /** Shared checkers board and turn. */
  checkers?: CheckersState | null;
  /** Shared Chinese checkers star, seats, and turn. */
  chinese?: ChineseState | null;
  /** Klondike layout, stock, and undo. */
  klondike?: KlondikeState | null;
  /** Pyramid layout, stock, and undo. */
  pyramid?: PyramidState | null;
  /** Spider layout, stock, and undo. */
  spider?: SpiderState | null;
  /** TriPeaks layout, stock, and undo. */
  tripeaks?: TriPeaksState | null;
  /** Yahtzee dice, holds, and whose turn it is. */
  yahtzee?: YahtzeeState | null;
  /**
   * Monopoly turn, ownership, deeds, and decks. Saved on every game because
   * deployed rules require the key.
   */
  monopoly?: MonopolyPlay | null;
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
  fillRandom(bytes);
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
  return randomId();
}

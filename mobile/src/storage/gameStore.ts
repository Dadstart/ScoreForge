import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Transaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { withAddedPlayer } from '../domain/addPlayer';
import { createCheckersState } from '../domain/checkers';
import { createChineseState, type ChineseSetup } from '../domain/chineseCheckers';
import { createKlondikeState, packKlondike, unpackKlondike, type DrawCount } from '../domain/klondike';
import { createPyramidState, packPyramid, unpackPyramid } from '../domain/pyramid';
import {
  isShareCode,
  normalizeShareCode,
  generateShareCode,
  type Game,
  type Player,
  type ScoreEvent,
} from '../domain/models';
import { nextSavedRevision } from '../domain/revisions';
import { createSorryState } from '../domain/sorry';
import { db, ensureAnonymousAuth } from '../firebase/app';
import { forgetShareCode, loadKnownShareCodes, rememberShareCode } from './knownCodesStore';

export { preferNewerGame, StaleGameError } from '../domain/revisions';

const DELETE_CHUNK = 400;

type StoredGame = {
  id?: string;
  shareCode?: string;
  name?: string;
  templateId?: string;
  players?: Player[];
  events?: ScoreEvent[];
  status?: Game['status'];
  targetScore?: number | null;
  maxRounds?: number | null;
  tokenSpaces?: Record<string, number>;
  sorry?: Game['sorry'];
  checkers?: Game['checkers'];
  chinese?: Game['chinese'];
  klondike?: unknown;
  pyramid?: unknown;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
};

function gameRef(shareCode: string) {
  return doc(db, 'games', shareCode);
}

function eventsCollectionRef(shareCode: string): CollectionReference {
  return collection(db, 'games', shareCode, 'events');
}

function requireShareCode(raw: string): string {
  const code = normalizeShareCode(raw);
  if (!isShareCode(code)) throw new Error('Enter the full 6-character share code.');
  return code;
}

function revisionOf(data: StoredGame): number {
  return typeof data.revision === 'number' && Number.isInteger(data.revision) && data.revision >= 0
    ? data.revision
    : 0;
}

function cleanPlayer(player: Player): Player {
  const next: Player = { id: player.id, name: player.name };
  if (player.token != null) next.token = player.token;
  return next;
}

function cleanEvent(event: ScoreEvent): ScoreEvent {
  const next: ScoreEvent = {
    id: event.id,
    playerId: event.playerId,
    points: event.points,
    timestamp: event.timestamp,
  };
  if (event.roundNumber != null) next.roundNumber = event.roundNumber;
  if (event.box != null) next.box = event.box;
  return next;
}

function toStored(game: Game): Record<string, unknown> {
  return {
    id: game.shareCode,
    shareCode: game.shareCode,
    name: game.name,
    templateId: game.templateId,
    players: game.players.map(cleanPlayer),
    events: game.events.map(cleanEvent),
    status: game.status,
    targetScore: game.targetScore ?? null,
    maxRounds: game.maxRounds ?? null,
    tokenSpaces: game.tokenSpaces ?? {},
    sorry: game.sorry ?? null,
    checkers: game.checkers ?? null,
    chinese: game.chinese ?? null,
    klondike: game.klondike ? packKlondike(game.klondike) : null,
    pyramid: game.pyramid ? packPyramid(game.pyramid) : null,
    revision: game.revision,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  };
}

function fromStored(shareCode: string, data: StoredGame, events: ScoreEvent[]): Game {
  return {
    id: shareCode,
    shareCode,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Game',
    templateId: typeof data.templateId === 'string' ? data.templateId : 'free-play',
    players: Array.isArray(data.players) ? data.players : [],
    events: [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)),
    status: data.status === 'Completed' ? 'Completed' : 'InProgress',
    targetScore: typeof data.targetScore === 'number' ? data.targetScore : null,
    maxRounds: typeof data.maxRounds === 'number' ? data.maxRounds : null,
    tokenSpaces: data.tokenSpaces && typeof data.tokenSpaces === 'object' ? data.tokenSpaces : {},
    sorry: data.sorry ?? null,
    checkers: data.checkers ?? null,
    chinese: data.chinese ?? null,
    klondike: unpackKlondike(data.klondike),
    pyramid: unpackPyramid(data.pyramid),
    revision: revisionOf(data),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
  };
}

function isPermissionDenied(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'permission-denied';
}

async function commitDeletes(refs: DocumentReference[]): Promise<void> {
  for (let index = 0; index < refs.length; index += DELETE_CHUNK) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(index, index + DELETE_CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

async function fetchLegacyEvents(shareCode: string): Promise<ScoreEvent[]> {
  const snap = await getDocs(eventsCollectionRef(shareCode));
  return snap.docs.map((item) => item.data() as ScoreEvent);
}

async function deleteLegacyEventDocs(shareCode: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await commitDeletes(ids.map((id) => doc(eventsCollectionRef(shareCode), id)));
}

/**
 * Copy subcollection events onto the game document, then delete those docs.
 * Listing events is denied once `events` is stored on the parent, which stops
 * a collection-group query from leaking share codes.
 */
async function migrateLegacyEvents(shareCode: string, legacy: ScoreEvent[]): Promise<Game> {
  const migrated = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(gameRef(shareCode));
    if (!snap.exists()) throw new Error('Game not found. Check the share code and try again.');
    const data = snap.data() as StoredGame;
    if (Array.isArray(data.events)) return fromStored(shareCode, data, data.events);
    const current = fromStored(shareCode, data, legacy);
    const saved: Game = {
      ...current,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    transaction.set(gameRef(shareCode), toStored(saved));
    return saved;
  });
  if (legacy.length > 0) {
    try {
      await deleteLegacyEventDocs(
        shareCode,
        legacy.map((event) => event.id),
      );
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  return migrated;
}

async function readForWrite(transaction: Transaction, shareCode: string): Promise<Game> {
  const snap = await transaction.get(gameRef(shareCode));
  if (!snap.exists()) throw new Error('This game no longer exists.');
  const data = snap.data() as StoredGame;
  if (!Array.isArray(data.events)) {
    throw new Error('This game is still opening. Try again.');
  }
  return fromStored(shareCode, data, data.events);
}

function writeGame(transaction: Transaction, shareCode: string, game: Game): Game {
  const saved: Game = {
    ...game,
    id: shareCode,
    shareCode,
    updatedAt: new Date().toISOString(),
  };
  transaction.set(gameRef(shareCode), toStored(saved));
  return saved;
}

class CodeTakenError extends Error {
  constructor() {
    super('Share code already exists.');
    this.name = 'CodeTakenError';
  }
}

export async function loadGames(): Promise<Game[]> {
  await ensureAnonymousAuth();
  const codes = await loadKnownShareCodes();
  const games: Game[] = [];
  for (const code of codes) {
    const game = await findGameByShareCode(code);
    if (game) games.push(game);
    else await forgetShareCode(code);
  }
  return games.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function findGameByShareCode(code: string): Promise<Game | null> {
  await ensureAnonymousAuth();
  const normalized = normalizeShareCode(code);
  if (!isShareCode(normalized)) return null;
  const snap = await getDoc(gameRef(normalized));
  if (!snap.exists()) return null;
  const data = snap.data() as StoredGame;
  if (Array.isArray(data.events)) return fromStored(normalized, data, data.events);
  let legacy: ScoreEvent[] = [];
  try {
    legacy = await fetchLegacyEvents(normalized);
  } catch (err) {
    if (!isPermissionDenied(err)) throw err;
    const again = await getDoc(gameRef(normalized));
    if (!again.exists()) return null;
    const fresh = again.data() as StoredGame;
    return fromStored(normalized, fresh, Array.isArray(fresh.events) ? fresh.events : []);
  }
  return migrateLegacyEvents(normalized, legacy);
}

/**
 * Store this device's copy of the game.
 * Fails when the server revision is not the revision this edit started from.
 */
export async function saveGame(game: Game): Promise<Game> {
  await ensureAnonymousAuth();
  const code = requireShareCode(game.shareCode);
  return runTransaction(db, async (transaction) => {
    const current = await readForWrite(transaction, code);
    const revision = nextSavedRevision(game.revision, current.revision);
    return writeGame(transaction, code, { ...game, revision });
  });
}

/** Apply a change to the latest server game. Used for joins, which must not replace the board. */
export async function addPlayerToGame(shareCode: string, rawName: string, maxPlayers: number): Promise<Game> {
  await ensureAnonymousAuth();
  const name = rawName.trim();
  if (!name) throw new Error('Enter a display name.');
  const code = requireShareCode(shareCode);
  const saved = await runTransaction(db, async (transaction) => {
    const current = await readForWrite(transaction, code);
    const existing = current.players.find((player) => player.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) return current;
    const next = withAddedPlayer(current, name, maxPlayers);
    const revision = nextSavedRevision(current.revision, current.revision);
    return writeGame(transaction, code, { ...next, revision });
  });
  await rememberShareCode(code);
  return saved;
}

/** Create a new cloud game with a unique share code. */
export async function createAndSaveGame(partial: {
  name: string;
  templateId: string;
  players: Game['players'];
  targetScore?: number | null;
  maxRounds?: number | null;
  requireJumps?: boolean;
  chinese?: ChineseSetup;
  drawCount?: DrawCount;
}): Promise<Game> {
  await ensureAnonymousAuth();
  const now = new Date().toISOString();
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    const shareCode = generateShareCode();
    const game: Game = {
      id: shareCode,
      shareCode,
      name: partial.name,
      templateId: partial.templateId,
      players: partial.players,
      events: [],
      status: 'InProgress',
      targetScore: partial.targetScore ?? null,
      maxRounds: partial.maxRounds ?? null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    if (partial.templateId === 'sorry') game.sorry = createSorryState(partial.players);
    if (partial.templateId === 'checkers') {
      game.checkers = createCheckersState(partial.players, { requireJumps: partial.requireJumps !== false });
    }
    if (partial.templateId === 'chinese-checkers') {
      game.chinese = createChineseState(partial.players, partial.chinese);
    }
    if (partial.templateId === 'klondike') {
      game.klondike = createKlondikeState(partial.drawCount === 3 ? 3 : 1);
    }
    if (partial.templateId === 'pyramid') {
      game.pyramid = createPyramidState();
    }
    try {
      const saved = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(gameRef(shareCode));
        if (snap.exists()) throw new CodeTakenError();
        return writeGame(transaction, shareCode, game);
      });
      await rememberShareCode(shareCode);
      return saved;
    } catch (err) {
      if (!(err instanceof CodeTakenError)) throw err;
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not allocate a unique share code. Try again.');
}

export async function deleteGame(gameId: string, shareCode?: string): Promise<void> {
  await ensureAnonymousAuth();
  const code = normalizeShareCode(shareCode || gameId);
  if (!isShareCode(code)) {
    await forgetShareCode(gameId);
    return;
  }
  const snap = await getDoc(gameRef(code));
  const inline = snap.exists() && Array.isArray((snap.data() as StoredGame).events);
  if (!inline) {
    try {
      const events = await getDocs(eventsCollectionRef(code));
      await commitDeletes(events.docs.map((item) => item.ref));
    } catch (err) {
      if (!isPermissionDenied(err)) throw err;
    }
  }
  await deleteDoc(gameRef(code));
  await forgetShareCode(code);
}

export async function joinGameByShareCode(
  code: string,
  displayName: string,
  maxPlayers: number,
): Promise<Game> {
  return addPlayerToGame(code, displayName, maxPlayers);
}

/** Live updates for a game identified by its share code. Events live on the game document. */
export function subscribeGame(
  shareCode: string,
  onChange: (game: Game | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const code = normalizeShareCode(shareCode);
  let unsub: Unsubscribe | null = null;
  let cancelled = false;
  let generation = 0;

  void (async () => {
    try {
      await ensureAnonymousAuth();
      if (cancelled) return;
      if (!isShareCode(code)) {
        onChange(null);
        return;
      }
      await rememberShareCode(code);
      if (cancelled) return;

      unsub = onSnapshot(
        gameRef(code),
        (docSnap) => {
          const gen = ++generation;
          void (async () => {
            try {
              if (!docSnap.exists()) {
                if (!cancelled && gen === generation) onChange(null);
                return;
              }
              const data = docSnap.data() as StoredGame;
              if (!Array.isArray(data.events)) {
                let legacy: ScoreEvent[] | null = null;
                try {
                  legacy = await fetchLegacyEvents(code);
                } catch (err) {
                  if (!isPermissionDenied(err)) throw err;
                }
                if (cancelled || gen !== generation) return;
                if (legacy) {
                  const migrated = await migrateLegacyEvents(code, legacy);
                  if (!cancelled && gen === generation) onChange(migrated);
                  return;
                }
                const again = await getDoc(gameRef(code));
                if (cancelled || gen !== generation) return;
                if (!again.exists()) {
                  onChange(null);
                  return;
                }
                const fresh = again.data() as StoredGame;
                onChange(fromStored(code, fresh, Array.isArray(fresh.events) ? fresh.events : []));
                return;
              }
              if (!cancelled && gen === generation) onChange(fromStored(code, data, data.events));
            } catch (err) {
              if (!cancelled && gen === generation) {
                onError?.(err instanceof Error ? err : new Error(String(err)));
              }
            }
          })();
        },
        (err) => onError?.(err),
      );
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => {
    cancelled = true;
    unsub?.();
  };
}

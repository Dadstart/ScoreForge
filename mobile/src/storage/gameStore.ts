import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  createPlayer,
  generateShareCode,
  normalizeShareCode,
  type Game,
  type ScoreEvent,
} from '../domain/models';
import { db, ensureAnonymousAuth } from '../firebase/app';
import {
  forgetShareCode,
  loadKnownShareCodes,
  rememberShareCode,
} from './knownCodesStore';

type GameDoc = Omit<Game, 'events'>;

function gameRef(shareCode: string) {
  return doc(db, 'games', shareCode);
}

function eventsCol(shareCode: string) {
  return collection(db, 'games', shareCode, 'events');
}

function toGameDoc(game: Game): GameDoc {
  const { events: _events, ...meta } = game;
  return {
    ...meta,
    shareCode: normalizeShareCode(game.shareCode),
    updatedAt: new Date().toISOString(),
  };
}

function fromGameDoc(data: GameDoc, events: ScoreEvent[]): Game {
  return {
    ...data,
    shareCode: normalizeShareCode(data.shareCode),
    events: [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}

async function fetchEvents(shareCode: string): Promise<ScoreEvent[]> {
  const snap = await getDocs(eventsCol(shareCode));
  return snap.docs.map((d) => d.data() as ScoreEvent);
}

async function allocateShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateShareCode();
    const existing = await getDoc(gameRef(code));
    if (!existing.exists()) return code;
  }
  throw new Error('Could not allocate a unique share code. Try again.');
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
  if (normalized.length < 4) return null;
  const snap = await getDoc(gameRef(normalized));
  if (!snap.exists()) return null;
  const events = await fetchEvents(normalized);
  return fromGameDoc(snap.data() as GameDoc, events);
}

/**
 * Persist game metadata and reconcile events with Firestore.
 * New local events are uploaded; remote-only events are deleted (undo/reset).
 */
export async function saveGame(game: Game): Promise<void> {
  await ensureAnonymousAuth();
  const code = normalizeShareCode(game.shareCode);
  if (code.length < 4) throw new Error('Game is missing a share code.');

  const meta = toGameDoc({ ...game, shareCode: code, id: code });
  await setDoc(gameRef(code), meta, { merge: true });

  const remoteSnap = await getDocs(eventsCol(code));
  const remoteIds = new Set(remoteSnap.docs.map((d) => d.id));
  const localIds = new Set(game.events.map((e) => e.id));

  const batch = writeBatch(db);
  let ops = 0;

  for (const event of game.events) {
    if (!remoteIds.has(event.id)) {
      batch.set(doc(eventsCol(code), event.id), event);
      ops++;
    }
  }
  for (const remote of remoteSnap.docs) {
    if (!localIds.has(remote.id)) {
      batch.delete(remote.ref);
      ops++;
    }
  }
  if (ops > 0) await batch.commit();

  await rememberShareCode(code);
}

/** Create a new cloud game with a unique share code. */
export async function createAndSaveGame(partial: {
  name: string;
  templateId: string;
  players: Game['players'];
  targetScore?: number | null;
  maxRounds?: number | null;
}): Promise<Game> {
  await ensureAnonymousAuth();
  const shareCode = await allocateShareCode();
  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(gameRef(shareCode), toGameDoc(game));
  await rememberShareCode(shareCode);
  return game;
}

export async function deleteGame(gameId: string): Promise<void> {
  await ensureAnonymousAuth();
  const games = await loadGames();
  const game = games.find((g) => g.id === gameId || g.shareCode === gameId);
  if (!game) {
    await forgetShareCode(gameId);
    return;
  }
  const code = normalizeShareCode(game.shareCode);
  const events = await getDocs(eventsCol(code));
  const batch = writeBatch(db);
  for (const e of events.docs) batch.delete(e.ref);
  batch.delete(gameRef(code));
  await batch.commit();
  await forgetShareCode(code);
}

export async function joinGameByShareCode(
  code: string,
  displayName: string,
  maxPlayers: number,
): Promise<Game> {
  await ensureAnonymousAuth();
  const name = displayName.trim();
  if (!name) throw new Error('Enter a display name.');

  const normalized = normalizeShareCode(code);
  const game = await findGameByShareCode(normalized);
  if (!game) {
    throw new Error('Game not found. Check the share code and try again.');
  }

  const existing = game.players.find(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    await rememberShareCode(normalized);
    return game;
  }
  if (game.players.length >= maxPlayers) {
    throw new Error(`This game already has the maximum of ${maxPlayers} players.`);
  }

  const updated: Game = {
    ...game,
    players: [...game.players, createPlayer(name)],
    updatedAt: new Date().toISOString(),
  };
  await setDoc(gameRef(normalized), toGameDoc(updated), { merge: true });
  await rememberShareCode(normalized);
  return updated;
}

/** Live updates for a game identified by share code (or id === shareCode). */
export function subscribeGame(
  shareCode: string,
  onChange: (game: Game | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const code = normalizeShareCode(shareCode);
  let meta: GameDoc | null = null;
  let events: ScoreEvent[] = [];
  let unsubMeta: Unsubscribe | null = null;
  let unsubEvents: Unsubscribe | null = null;
  let cancelled = false;

  const emit = () => {
    if (!meta) {
      onChange(null);
      return;
    }
    onChange(fromGameDoc(meta, events));
  };

  void (async () => {
    try {
      await ensureAnonymousAuth();
      if (cancelled) return;
      if (code.length < 4) {
        onChange(null);
        return;
      }

      await rememberShareCode(code);

      unsubEvents = onSnapshot(
        eventsCol(code),
        (snap) => {
          events = snap.docs.map((d) => d.data() as ScoreEvent);
          emit();
        },
        (err) => onError?.(err),
      );

      unsubMeta = onSnapshot(
        gameRef(code),
        (docSnap) => {
          if (!docSnap.exists()) {
            meta = null;
            emit();
            return;
          }
          meta = docSnap.data() as GameDoc;
          emit();
        },
        (err) => onError?.(err),
      );
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => {
    cancelled = true;
    unsubMeta?.();
    unsubEvents?.();
  };
}

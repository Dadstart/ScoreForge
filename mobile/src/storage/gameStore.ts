import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createPlayer,
  generateShareCode,
  normalizeShareCode,
  type Game,
} from '../domain/models';

const STORAGE_KEY = 'scoreforge.games';

function ensureShareCode(game: Game): Game {
  if (game.shareCode && normalizeShareCode(game.shareCode).length >= 4) {
    return { ...game, shareCode: normalizeShareCode(game.shareCode) };
  }
  return { ...game, shareCode: generateShareCode() };
}

export async function loadGames(): Promise<Game[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Game[];
    if (!Array.isArray(parsed)) return [];
    let changed = false;
    const games = parsed.map((g) => {
      const next = ensureShareCode(g);
      if (next.shareCode !== g.shareCode) changed = true;
      return next;
    });
    if (changed) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    }
    return games;
  } catch {
    return [];
  }
}

export async function saveGame(game: Game): Promise<void> {
  const games = await loadGames();
  const updated = ensureShareCode({
    ...game,
    updatedAt: new Date().toISOString(),
  });
  const index = games.findIndex((g) => g.id === updated.id);
  if (index >= 0) games[index] = updated;
  else games.push(updated);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

export async function deleteGame(gameId: string): Promise<void> {
  const games = await loadGames();
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(games.filter((g) => g.id !== gameId)),
  );
}

export async function findGameByShareCode(code: string): Promise<Game | null> {
  const normalized = normalizeShareCode(code);
  if (!normalized) return null;
  const games = await loadGames();
  return games.find((g) => normalizeShareCode(g.shareCode) === normalized) ?? null;
}

/** Open a game by share code and ensure the given display name is a player. */
export async function joinGameByShareCode(
  code: string,
  displayName: string,
  maxPlayers: number,
): Promise<Game> {
  const name = displayName.trim();
  if (!name) {
    throw new Error('Enter a display name.');
  }
  const game = await findGameByShareCode(code);
  if (!game) {
    throw new Error(
      'No game found with that code on this device yet. Cross-device sync is coming next.',
    );
  }

  const existing = game.players.find(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (existing) {
    return game;
  }
  if (game.players.length >= maxPlayers) {
    throw new Error(`This game already has the maximum of ${maxPlayers} players.`);
  }

  const updated: Game = {
    ...game,
    players: [...game.players, createPlayer(name)],
  };
  await saveGame(updated);
  return updated;
}


import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Game } from '../domain/models';

const STORAGE_KEY = 'scoreforge.games';

export async function loadGames(): Promise<Game[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Game[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveGame(game: Game): Promise<void> {
  const games = await loadGames();
  const updated = { ...game, updatedAt: new Date().toISOString() };
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

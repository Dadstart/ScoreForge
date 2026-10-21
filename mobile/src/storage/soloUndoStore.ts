import AsyncStorage from '@react-native-async-storage/async-storage';
import { soloUndoFromJson, soloUndoRecord, withSoloUndo, type SoloUndoRecord } from '../domain/soloUndo';
import type { Game } from '../domain/models';

const memory = new Map<string, SoloUndoRecord | null>();

function storageKey(shareCode: string): string {
  return `scoreforge.soloUndo.${shareCode}`;
}

/** Remember undo for this position, on this device only. */
export function rememberSoloUndo(game: Game): void {
  const record = soloUndoRecord(game);
  memory.set(game.shareCode, record);
  const key = storageKey(game.shareCode);
  if (!record) {
    void AsyncStorage.removeItem(key);
    return;
  }
  void AsyncStorage.setItem(key, JSON.stringify(record));
}

export function recallSoloUndo(game: Game): Game {
  return withSoloUndo(game, memory.get(game.shareCode) ?? null);
}

export async function loadSoloUndo(shareCode: string): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey(shareCode));
  if (!raw) return;
  try {
    memory.set(shareCode, soloUndoFromJson(JSON.parse(raw) as unknown));
  } catch {
    memory.delete(shareCode);
  }
}

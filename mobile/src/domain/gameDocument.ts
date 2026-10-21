/**
 * Keys written on every game document. Firestore rules must allow this exact set.
 * This client sends every key, so a key missing from the rules rejects every save.
 */
export const GAME_DOCUMENT_KEYS = [
  'id',
  'shareCode',
  'name',
  'templateId',
  'playMode',
  'players',
  'events',
  'status',
  'targetScore',
  'maxRounds',
  'tokenSpaces',
  'sorry',
  'parcheesi',
  'backgammon',
  'checkers',
  'chess',
  'canasta',
  'uneaux',
  'skipBeaux',
  'reversi',
  'chinese',
  'klondike',
  'freecell',
  'pyramid',
  'tripeaks',
  'spider',
  'yahtzee',
  'monopoly',
  'revision',
  'createdAt',
  'updatedAt',
] as const;

export type GameDocumentKey = (typeof GAME_DOCUMENT_KEYS)[number];

const SOLO_UNDO_KEYS = ['klondike', 'freecell', 'pyramid', 'spider', 'tripeaks'] as const;

/** Solitaire undo stays on the device. The shared document stores the position only. */
export function withoutSoloUndo(stored: Record<string, unknown>): Record<string, unknown> {
  const next = { ...stored };
  for (const key of SOLO_UNDO_KEYS) {
    const value = next[key];
    if (value && typeof value === 'object') next[key] = { ...value, undo: [] };
  }
  return next;
}

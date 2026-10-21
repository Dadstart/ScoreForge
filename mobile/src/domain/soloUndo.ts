import type { Game } from './models';
import { packFreecell } from './freecell';
import { packKlondike } from './klondike';
import { packPyramid } from './pyramid';
import { packSpider } from './spider';
import { packTriPeaks } from './tripeaks';

/** Undo stacks for the solitaire games. They are not part of the shared position. */
export type SoloUndoRecord = {
  fingerprint: string;
  klondike: string[];
  freecell: string[];
  pyramid: string[];
  spider: string[];
  tripeaks: string[];
};

function position(game: Game): string {
  return JSON.stringify({
    klondike: game.klondike ? { ...packKlondike(game.klondike), undo: [] } : null,
    freecell: game.freecell ? { ...packFreecell(game.freecell), undo: [] } : null,
    pyramid: game.pyramid ? { ...packPyramid(game.pyramid), undo: [] } : null,
    spider: game.spider ? { ...packSpider(game.spider), undo: [] } : null,
    tripeaks: game.tripeaks ? { ...packTriPeaks(game.tripeaks), undo: [] } : null,
  });
}

function stacks(value: unknown): string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : [];
}

export function soloUndoRecord(game: Game): SoloUndoRecord | null {
  const record: SoloUndoRecord = {
    fingerprint: position(game),
    klondike: game.klondike?.undo ?? [],
    freecell: game.freecell?.undo ?? [],
    pyramid: game.pyramid?.undo ?? [],
    spider: game.spider?.undo ?? [],
    tripeaks: game.tripeaks?.undo ?? [],
  };
  if (
    record.klondike.length === 0 &&
    record.freecell.length === 0 &&
    record.pyramid.length === 0 &&
    record.spider.length === 0 &&
    record.tripeaks.length === 0
  ) {
    return null;
  }
  return record;
}

export function soloUndoFromJson(value: unknown): SoloUndoRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SoloUndoRecord>;
  if (typeof raw.fingerprint !== 'string') return null;
  return {
    fingerprint: raw.fingerprint,
    klondike: stacks(raw.klondike),
    freecell: stacks(raw.freecell),
    pyramid: stacks(raw.pyramid),
    spider: stacks(raw.spider),
    tripeaks: stacks(raw.tripeaks),
  };
}

/** Put this device's undo back when the shared position is still the one it belongs to. */
export function withSoloUndo(game: Game, record: SoloUndoRecord | null): Game {
  if (!record || record.fingerprint !== position(game)) return game;
  return {
    ...game,
    klondike: game.klondike ? { ...game.klondike, undo: record.klondike } : game.klondike,
    freecell: game.freecell ? { ...game.freecell, undo: record.freecell } : game.freecell,
    pyramid: game.pyramid ? { ...game.pyramid, undo: record.pyramid } : game.pyramid,
    spider: game.spider ? { ...game.spider, undo: record.spider } : game.spider,
    tripeaks: game.tripeaks ? { ...game.tripeaks, undo: record.tripeaks } : game.tripeaks,
  };
}

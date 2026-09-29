import { createScoreEvent, type Game, type Player, type ScoreEvent } from './models';

export const UPPER_BONUS_AT = 63;
export const UPPER_BONUS = 35;
export const YAHTZEE_BONUS_POINTS = 100;
export const YAHTZEE_BONUS_BOX = 'yahtzeeBonus';

export type YahtzeeBoxKind = 'face' | 'fixed' | 'sum';

export type YahtzeeBox = {
  id: string;
  section: 'upper' | 'lower';
  label: string;
  hint: string;
  kind: YahtzeeBoxKind;
  face?: number;
  fixed?: number;
};

export const YAHTZEE_BOXES: YahtzeeBox[] = [
  { id: 'aces', section: 'upper', label: 'Aces', hint: 'Sum of 1s', kind: 'face', face: 1 },
  { id: 'twos', section: 'upper', label: 'Twos', hint: 'Sum of 2s', kind: 'face', face: 2 },
  { id: 'threes', section: 'upper', label: 'Threes', hint: 'Sum of 3s', kind: 'face', face: 3 },
  { id: 'fours', section: 'upper', label: 'Fours', hint: 'Sum of 4s', kind: 'face', face: 4 },
  { id: 'fives', section: 'upper', label: 'Fives', hint: 'Sum of 5s', kind: 'face', face: 5 },
  { id: 'sixes', section: 'upper', label: 'Sixes', hint: 'Sum of 6s', kind: 'face', face: 6 },
  { id: 'threeKind', section: 'lower', label: '3 of a Kind', hint: 'Total of all dice', kind: 'sum' },
  { id: 'fourKind', section: 'lower', label: '4 of a Kind', hint: 'Total of all dice', kind: 'sum' },
  { id: 'fullHouse', section: 'lower', label: 'Full House', hint: '25 points', kind: 'fixed', fixed: 25 },
  { id: 'smallStraight', section: 'lower', label: 'Sm. Straight', hint: '30 points', kind: 'fixed', fixed: 30 },
  { id: 'largeStraight', section: 'lower', label: 'Lg. Straight', hint: '40 points', kind: 'fixed', fixed: 40 },
  { id: 'yahtzee', section: 'lower', label: 'Yahtzee', hint: '50 points', kind: 'fixed', fixed: 50 },
  { id: 'chance', section: 'lower', label: 'Chance', hint: 'Total of all dice', kind: 'sum' },
];

export function boxById(id: string): YahtzeeBox | undefined {
  return YAHTZEE_BOXES.find((box) => box.id === id);
}

/** Chip values offered when filling a box. Sum boxes also accept any integer 0–30. */
export function chipScores(box: YahtzeeBox): number[] {
  if (box.kind === 'face' && box.face) {
    const scores: number[] = [];
    for (let count = 0; count <= 5; count++) scores.push(count * box.face);
    return scores;
  }
  if (box.kind === 'fixed' && box.fixed != null) return [0, box.fixed];
  return [0, 5, 10, 15, 20, 25, 30];
}

export function scoreError(box: YahtzeeBox, points: number): string | null {
  if (!Number.isInteger(points)) return 'Enter a whole number.';
  if (box.kind === 'face' && box.face) {
    const max = box.face * 5;
    if (points < 0 || points > max || points % box.face !== 0) {
      return `${box.label} must be a multiple of ${box.face}, from 0 to ${max}.`;
    }
    return null;
  }
  if (box.kind === 'fixed' && box.fixed != null) {
    if (points !== 0 && points !== box.fixed) {
      return `${box.label} scores ${box.fixed}, or 0 to scratch.`;
    }
    return null;
  }
  if (points < 0 || points > 30) return `${box.label} is from 0 to 30.`;
  return null;
}

/** Latest score for a player and box. Null means the box is still open. */
export function scoreForBox(events: ScoreEvent[], playerId: string, boxId: string): number | null {
  let score: number | null = null;
  for (const event of events) {
    if (event.playerId === playerId && event.box === boxId) score = event.points;
  }
  return score;
}

function latestBoxEvent(events: ScoreEvent[], playerId: string, boxId: string): ScoreEvent | null {
  let found: ScoreEvent | null = null;
  for (const event of events) {
    if (event.playerId === playerId && event.box === boxId) found = event;
  }
  return found;
}

/**
 * Extra Yahtzees after the 50-point box. A five-of-a-kind shows up as a full upper
 * box, or as 5 or 30 in 3 of a Kind, 4 of a Kind, or Chance. Each one is 100 points.
 * Only boxes scored after the Yahtzee box count, so an earlier five-of-a-kind does not.
 */
export function yahtzeeBonusCount(events: ScoreEvent[], playerId: string): number {
  const yahtzee = latestBoxEvent(events, playerId, 'yahtzee');
  if (!yahtzee || yahtzee.points !== 50) return 0;
  const explicit = events.filter((event) => event.playerId === playerId && event.box === YAHTZEE_BONUS_BOX).length;
  if (explicit > 0) return explicit;
  let extras = 0;
  for (const box of YAHTZEE_BOXES) {
    if (box.id === 'yahtzee') continue;
    const scoring = latestBoxEvent(events, playerId, box.id);
    if (!scoring || scoring.timestamp <= yahtzee.timestamp) continue;
    const score = scoring.points;
    if (box.kind === 'face' && box.face != null && score === box.face * 5) extras += 1;
    else if (
      (box.id === 'threeKind' || box.id === 'fourKind' || box.id === 'chance') &&
      (score === 5 || score === 30)
    ) {
      extras += 1;
    }
  }
  return extras;
}

function sumSection(events: ScoreEvent[], playerId: string, section: 'upper' | 'lower'): number {
  return YAHTZEE_BOXES.filter((box) => box.section === section).reduce(
    (sum, box) => sum + (scoreForBox(events, playerId, box.id) ?? 0),
    0,
  );
}

export function grandTotal(events: ScoreEvent[], playerId: string): number {
  const upper = sumSection(events, playerId, 'upper');
  const lower = sumSection(events, playerId, 'lower');
  const upperBonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
  return upper + upperBonus + lower + yahtzeeBonusCount(events, playerId) * YAHTZEE_BONUS_POINTS;
}

export function isScorecardComplete(game: Game): boolean {
  if (game.players.length === 0) return false;
  return game.players.every((player) =>
    YAHTZEE_BOXES.every((box) => scoreForBox(game.events, player.id, box.id) !== null),
  );
}

export type PlayerCard = {
  playerId: string;
  name: string;
  isYou: boolean;
  isWinner: boolean;
  isLeader: boolean;
  boxes: Record<string, number | null>;
  upper: number;
  upperBonus: number;
  upperTotal: number;
  lower: number;
  bonusCount: number;
  bonusPoints: number;
  grand: number;
};

export function buildPlayerCard(
  events: ScoreEvent[],
  player: Player,
  flags: { isYou: boolean; isWinner: boolean; isLeader: boolean },
): PlayerCard {
  const boxes: Record<string, number | null> = {};
  for (const box of YAHTZEE_BOXES) {
    boxes[box.id] = scoreForBox(events, player.id, box.id);
  }
  const upper = sumSection(events, player.id, 'upper');
  const lower = sumSection(events, player.id, 'lower');
  const upperBonus = upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0;
  const bonusCount = yahtzeeBonusCount(events, player.id);
  const bonusPoints = bonusCount * YAHTZEE_BONUS_POINTS;
  return {
    playerId: player.id,
    name: player.name,
    ...flags,
    boxes,
    upper,
    upperBonus,
    upperTotal: upper + upperBonus,
    lower,
    bonusCount,
    bonusPoints,
    grand: upper + upperBonus + lower + bonusPoints,
  };
}

/** Append a box score. A later event for the same box replaces it, so undo can restore the previous one. */
export function withBoxScore(
  events: ScoreEvent[],
  playerId: string,
  boxId: string,
  points: number,
): ScoreEvent[] {
  return [...events, createScoreEvent(playerId, points, null, boxId)];
}

export function withoutBox(events: ScoreEvent[], playerId: string, boxId: string): ScoreEvent[] {
  const cleared = events.filter((event) => !(event.playerId === playerId && event.box === boxId));
  if (boxId !== 'yahtzee') return cleared;
  return cleared.filter(
    (event) => !(event.playerId === playerId && event.box === YAHTZEE_BONUS_BOX),
  );
}

/** Drop the latest score on the card, whichever column it belongs to. */
export function withoutLastCardEntry(events: ScoreEvent[]): ScoreEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].box && events[i].box !== YAHTZEE_BONUS_BOX) {
      return events.filter((_, index) => index !== i);
    }
  }
  return events;
}

export function withoutLastEntry(events: ScoreEvent[], playerId: string): ScoreEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].playerId === playerId && events[i].box) {
      return events.filter((_, index) => index !== i);
    }
  }
  return events;
}

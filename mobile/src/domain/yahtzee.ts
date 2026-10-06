import { fillRandom } from './secureRandom';
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
export function scoreForBox(events: readonly ScoreEvent[], playerId: string, boxId: string): number | null {
  let score: number | null = null;
  for (const event of events) {
    if (event.playerId === playerId && event.box === boxId) score = event.points;
  }
  return score;
}

function latestBoxEvent(events: readonly ScoreEvent[], playerId: string, boxId: string): ScoreEvent | null {
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
export function yahtzeeBonusCount(events: readonly ScoreEvent[], playerId: string): number {
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

function sumSection(events: readonly ScoreEvent[], playerId: string, section: 'upper' | 'lower'): number {
  return YAHTZEE_BOXES.filter((box) => box.section === section).reduce(
    (sum, box) => sum + (scoreForBox(events, playerId, box.id) ?? 0),
    0,
  );
}

export function grandTotal(events: readonly ScoreEvent[], playerId: string): number {
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
export function withoutLastCardEntry(events: readonly ScoreEvent[]): ScoreEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].box && events[i].box !== YAHTZEE_BONUS_BOX) {
      return events.filter((_, index) => index !== i);
    }
  }
  return [...events];
}

export function withoutLastEntry(events: ScoreEvent[], playerId: string): ScoreEvent[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].playerId === playerId && events[i].box) {
      return events.filter((_, index) => index !== i);
    }
  }
  return events;
}

export const DICE_COUNT = 5;
export const ROLLS_PER_TURN = 3;
const UNDO_LIMIT = 40;

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export type Dice = [DieFace, DieFace, DieFace, DieFace, DieFace];
export type Holds = [boolean, boolean, boolean, boolean, boolean];

export type YahtzeeTurn = {
  playerId: string;
  /** Null until the first roll of the turn. */
  dice: Dice | null;
  held: Holds;
  /** Rolls still available. A turn starts with 3. */
  rollsLeft: number;
};

export type YahtzeeUndo = {
  turn: YahtzeeTurn;
  playerId: string;
  boxId: string;
  /** True when this score also wrote a +100 Yahtzee bonus. */
  bonus: boolean;
};

export type YahtzeeState = {
  turn: YahtzeeTurn;
  undo: YahtzeeUndo[];
};

export function createYahtzeeState(
  players: readonly { id: string }[],
  events: readonly ScoreEvent[] = [],
): YahtzeeState {
  return { turn: turnFor(players, events, ''), undo: [] };
}

export function diceTotal(dice: readonly number[]): number {
  return dice.reduce((sum, face) => sum + face, 0);
}

/** Roll every die that is not held. `faces` supplies those dice, in order, for tests. */
export function rollDice(state: YahtzeeState, faces?: readonly number[]): YahtzeeState | null {
  if (state.turn.rollsLeft <= 0) return null;
  const needed = state.turn.dice ? state.turn.held.filter((keep) => !keep).length : DICE_COUNT;
  if (faces && (faces.length !== needed || faces.some((face) => !isFace(face)))) return null;
  let cursor = 0;
  const next: DieFace[] = [];
  for (let index = 0; index < DICE_COUNT; index++) {
    if (state.turn.dice && state.turn.held[index]) {
      next.push(state.turn.dice[index]);
      continue;
    }
    const face = faces ? faces[cursor] : randomFace();
    cursor += 1;
    if (!isFace(face)) return null;
    next.push(face);
  }
  return {
    ...state,
    turn: {
      ...state.turn,
      dice: next as Dice,
      held: state.turn.dice ? ([...state.turn.held] as Holds) : emptyHolds(),
      rollsLeft: state.turn.rollsLeft - 1,
    },
  };
}

/** Keep a die for the next roll. Holds lock once no rolls remain. */
export function toggleHold(state: YahtzeeState, index: number): YahtzeeState | null {
  if (!state.turn.dice || state.turn.rollsLeft <= 0) return null;
  if (!Number.isInteger(index) || index < 0 || index >= DICE_COUNT) return null;
  const held = [...state.turn.held] as Holds;
  held[index] = !held[index];
  return { ...state, turn: { ...state.turn, held } };
}

/**
 * Points each open box would score for these dice.
 * Null means the box cannot be chosen. A Yahtzee rolled after the Yahtzee box is
 * filled must go in the matching upper box, or in any lower box once that upper
 * box is filled. A second Yahtzee scores +100 only when the Yahtzee box is 50.
 */
export function scorePreview(
  dice: readonly number[],
  events: readonly ScoreEvent[],
  playerId: string,
): Record<string, number | null> {
  const scores: Record<string, number | null> = {};
  for (const box of YAHTZEE_BOXES) scores[box.id] = boxScore(box, dice, events, playerId);
  return scores;
}

export function scoreDice(
  state: YahtzeeState,
  events: readonly ScoreEvent[],
  players: readonly { id: string }[],
  boxId: string,
): { state: YahtzeeState; events: ScoreEvent[] } | null {
  const dice = state.turn.dice;
  const box = boxById(boxId);
  if (!dice || !box) return null;
  const playerId = state.turn.playerId;
  const points = boxScore(box, dice, events, playerId);
  if (points == null) return null;
  const bonus = isFiveOfAKind(dice) && scoreForBox(events, playerId, 'yahtzee') === 50;
  const nextEvents = [...events];
  if (bonus) nextEvents.push(createScoreEvent(playerId, YAHTZEE_BONUS_POINTS, null, YAHTZEE_BONUS_BOX));
  nextEvents.push(createScoreEvent(playerId, points, null, boxId));
  const undo = [
    ...state.undo,
    { turn: cloneTurn(state.turn), playerId, boxId, bonus },
  ].slice(-UNDO_LIMIT);
  const nextId = nextPlayerId(players, nextEvents, playerId);
  const turn = nextId ? freshTurn(nextId) : { ...freshTurn(playerId), rollsLeft: 0 };
  return { state: { turn, undo }, events: nextEvents };
}

export function undoYahtzee(
  state: YahtzeeState,
  events: readonly ScoreEvent[],
): { state: YahtzeeState; events: ScoreEvent[] } | null {
  const last = state.undo[state.undo.length - 1];
  if (!last) {
    const nextEvents = withoutLastCardEntry(events);
    if (nextEvents.length === events.length) return null;
    return { state, events: nextEvents };
  }
  let nextEvents = withoutLatest(events, last.playerId, last.boxId);
  if (last.bonus) nextEvents = withoutLatest(nextEvents, last.playerId, YAHTZEE_BONUS_BOX);
  return { state: { turn: cloneTurn(last.turn), undo: state.undo.slice(0, -1) }, events: nextEvents };
}

export function ensureYahtzeeState(game: Game): Game {
  if (game.templateId !== 'yahtzee') return game;
  const parsed = parseYahtzeeState(game.yahtzee, game.players, game.events);
  if (game.yahtzee && sameState(game.yahtzee, parsed)) return game;
  return { ...game, yahtzee: parsed };
}

function parseYahtzeeState(
  raw: YahtzeeState | null | undefined,
  players: readonly { id: string }[],
  events: readonly ScoreEvent[],
): YahtzeeState {
  const turn = parseTurn(raw?.turn);
  const undo = Array.isArray(raw?.undo) ? raw.undo.flatMap((entry) => {
    const parsed = parseUndo(entry);
    return parsed ? [parsed] : [];
  }) : [];
  const anyoneOpen = players.some((player) => hasOpenBox(events, player.id));
  if (!anyoneOpen) {
    const done = turn && turn.dice == null && turn.rollsLeft === 0
      ? turn
      : { ...freshTurn(turn?.playerId || players[0]?.id || ''), rollsLeft: 0 };
    return { turn: done, undo: undo.slice(-UNDO_LIMIT) };
  }
  if (
    turn &&
    players.some((player) => player.id === turn.playerId) &&
    hasOpenBox(events, turn.playerId) &&
    (turn.dice != null || turn.rollsLeft === ROLLS_PER_TURN)
  ) {
    return { turn, undo: undo.slice(-UNDO_LIMIT) };
  }
  return { turn: turnFor(players, events, turn?.playerId ?? ''), undo: undo.slice(-UNDO_LIMIT) };
}

function parseTurn(raw: YahtzeeTurn | null | undefined): YahtzeeTurn | null {
  if (!raw || typeof raw.playerId !== 'string' || raw.playerId.length === 0) return null;
  if (!Number.isInteger(raw.rollsLeft) || raw.rollsLeft < 0 || raw.rollsLeft > ROLLS_PER_TURN) return null;
  if (raw.dice == null) {
    if (raw.rollsLeft !== ROLLS_PER_TURN && raw.rollsLeft !== 0) return null;
    return { playerId: raw.playerId, dice: null, held: emptyHolds(), rollsLeft: raw.rollsLeft };
  }
  if (!Array.isArray(raw.dice) || raw.dice.length !== DICE_COUNT || !raw.dice.every(isFace)) return null;
  if (!Array.isArray(raw.held) || raw.held.length !== DICE_COUNT || raw.held.some((keep) => typeof keep !== 'boolean')) {
    return null;
  }
  return {
    playerId: raw.playerId,
    dice: [...raw.dice] as Dice,
    held: [...raw.held] as Holds,
    rollsLeft: raw.dice ? Math.min(raw.rollsLeft, ROLLS_PER_TURN - 1) : raw.rollsLeft,
  };
}

function parseUndo(raw: YahtzeeUndo | null | undefined): YahtzeeUndo | null {
  const turn = parseTurn(raw?.turn);
  if (!turn || !raw || typeof raw.playerId !== 'string' || typeof raw.boxId !== 'string' || typeof raw.bonus !== 'boolean') {
    return null;
  }
  return { turn, playerId: raw.playerId, boxId: raw.boxId, bonus: raw.bonus };
}

function sameState(left: YahtzeeState, right: YahtzeeState): boolean {
  return (
    sameTurn(left.turn, right.turn) &&
    left.undo.length === right.undo.length &&
    left.undo.every((entry, index) => sameUndo(entry, right.undo[index]))
  );
}

function sameTurn(left: YahtzeeTurn, right: YahtzeeTurn): boolean {
  if (left.playerId !== right.playerId || left.rollsLeft !== right.rollsLeft) return false;
  if (left.dice == null || right.dice == null) return left.dice == null && right.dice == null;
  return left.dice.every((face, index) => face === right.dice?.[index] && left.held[index] === right.held[index]);
}

function sameUndo(left: YahtzeeUndo, right: YahtzeeUndo | undefined): boolean {
  return (
    right != null &&
    left.playerId === right.playerId &&
    left.boxId === right.boxId &&
    left.bonus === right.bonus &&
    sameTurn(left.turn, right.turn)
  );
}

function turnFor(
  players: readonly { id: string }[],
  events: readonly ScoreEvent[],
  currentId: string,
): YahtzeeTurn {
  return freshTurn(nextPlayerId(players, events, currentId) ?? players[0]?.id ?? currentId);
}

function freshTurn(playerId: string): YahtzeeTurn {
  return { playerId, dice: null, held: emptyHolds(), rollsLeft: ROLLS_PER_TURN };
}

function nextPlayerId(
  players: readonly { id: string }[],
  events: readonly ScoreEvent[],
  currentId: string,
): string | null {
  if (players.length === 0) return null;
  const start = players.findIndex((player) => player.id === currentId);
  const firstStep = start < 0 ? 0 : 1;
  for (let step = firstStep; step < firstStep + players.length; step++) {
    const player = players[step % players.length];
    if (hasOpenBox(events, player.id)) return player.id;
  }
  return null;
}

function hasOpenBox(events: readonly ScoreEvent[], playerId: string): boolean {
  return YAHTZEE_BOXES.some((box) => scoreForBox(events, playerId, box.id) == null);
}

function boxScore(
  box: YahtzeeBox,
  dice: readonly number[],
  events: readonly ScoreEvent[],
  playerId: string,
): number | null {
  if (!isDice(dice) || scoreForBox(events, playerId, box.id) != null) return null;
  if (!isFiveOfAKind(dice) || scoreForBox(events, playerId, 'yahtzee') == null) return naturalScore(box, dice);
  const face = dice[0];
  const upper = YAHTZEE_BOXES.find((candidate) => candidate.face === face);
  const upperOpen = upper != null && scoreForBox(events, playerId, upper.id) == null;
  if (upperOpen) return box.id === upper.id ? face * DICE_COUNT : null;
  const lowerOpen = YAHTZEE_BOXES.some(
    (candidate) => candidate.section === 'lower' && scoreForBox(events, playerId, candidate.id) == null,
  );
  if (lowerOpen) {
    if (box.section !== 'lower') return null;
    if (box.id === 'fullHouse') return 25;
    if (box.id === 'smallStraight') return 30;
    if (box.id === 'largeStraight') return 40;
    return diceTotal(dice);
  }
  return box.section === 'upper' ? 0 : null;
}

function naturalScore(box: YahtzeeBox, dice: readonly number[]): number {
  const counts = faceCounts(dice);
  if (box.kind === 'face' && box.face) return (counts[box.face] ?? 0) * box.face;
  if (box.id === 'threeKind') return ofAKind(counts, 3) ? diceTotal(dice) : 0;
  if (box.id === 'fourKind') return ofAKind(counts, 4) ? diceTotal(dice) : 0;
  if (box.id === 'fullHouse') return isFullHouse(counts) ? 25 : 0;
  if (box.id === 'smallStraight') return straightRun(counts) >= 4 ? 30 : 0;
  if (box.id === 'largeStraight') return straightRun(counts) >= 5 ? 40 : 0;
  if (box.id === 'yahtzee') return isFiveOfAKind(dice) ? 50 : 0;
  return diceTotal(dice);
}

function faceCounts(dice: readonly number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const face of dice) {
    if (isFace(face)) counts[face] += 1;
  }
  return counts;
}

function ofAKind(counts: readonly number[], size: number): boolean {
  return counts.some((count) => count >= size);
}

function isFullHouse(counts: readonly number[]): boolean {
  let three = false;
  let two = false;
  for (let face = 1; face <= 6; face++) {
    if (counts[face] === 3) three = true;
    if (counts[face] === 2) two = true;
  }
  return three && two;
}

function straightRun(counts: readonly number[]): number {
  let best = 0;
  let run = 0;
  for (let face = 1; face <= 6; face++) {
    if (counts[face] > 0) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

function isFiveOfAKind(dice: readonly number[]): boolean {
  return isDice(dice) && dice.every((face) => face === dice[0]);
}

function isDice(dice: readonly number[]): dice is Dice {
  return dice.length === DICE_COUNT && dice.every(isFace);
}

function isFace(value: unknown): value is DieFace {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6;
}

function emptyHolds(): Holds {
  return [false, false, false, false, false];
}

function cloneTurn(turn: YahtzeeTurn): YahtzeeTurn {
  return {
    playerId: turn.playerId,
    dice: turn.dice ? ([...turn.dice] as Dice) : null,
    held: [...turn.held] as Holds,
    rollsLeft: turn.rollsLeft,
  };
}

function withoutLatest(events: readonly ScoreEvent[], playerId: string, boxId: string): ScoreEvent[] {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index].playerId === playerId && events[index].box === boxId) {
      return events.filter((_, eventIndex) => eventIndex !== index);
    }
  }
  return [...events];
}

function randomFace(): DieFace {
  const bytes = new Uint8Array(1);
  let value = 256;
  do {
    fillRandom(bytes);
    value = bytes[0];
  } while (value >= 252);
  return ((value % 6) + 1) as DieFace;
}

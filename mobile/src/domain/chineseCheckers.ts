import type { Game, Player } from './models';

/**
 * Chinese checkers on the 121-hole star.
 *
 * A turn is one step to a neighboring hole, or a chain of jumps over adjacent
 * pieces. Jumped pieces stay put. You may stop a chain whenever you want.
 * Pieces may rest in the center, their own starting camp, or their opposite
 * camp — not in anyone else's point. The opposite point is always the goal.
 * Whoever fills a goal is skipped, and the others keep playing for the next place.
 */

export const CORNERS = [
  { id: 0, name: 'Red', point: 'North', fill: '#d64545', rim: '#f6c9c9' },
  { id: 1, name: 'Gold', point: 'Northeast', fill: '#e2a31a', rim: '#ffe3a3' },
  { id: 2, name: 'Green', point: 'Southeast', fill: '#2f9d5c', rim: '#c6f0d4' },
  { id: 3, name: 'Blue', point: 'South', fill: '#3b7ddd', rim: '#cfe0fb' },
  { id: 4, name: 'Purple', point: 'Southwest', fill: '#8a5cc4', rim: '#e3d2f6' },
  { id: 5, name: 'Orange', point: 'Northwest', fill: '#e07028', rim: '#f8d3b8' },
] as const;

export type Corner = 0 | 1 | 2 | 3 | 4 | 5;
export type PlayerCount = 2 | 3 | 4 | 6;
export type ChineseMode = 'ffa' | 'teams';
export type SetCount = 1 | 2 | 3;
/** Two players, two sets: both camps swap with the opponent, or one set aims at an empty point. */
export type TwoSetGoals = 'opponent' | 'empty';

export type ChineseSetup = {
  playerCount: PlayerCount;
  mode: ChineseMode;
  sets: SetCount;
  twoSetGoals: TwoSetGoals;
};

export type Cell = { q: number; r: number };

export type ChinesePiece = {
  q: number;
  r: number;
  corner: Corner;
};

export type ChineseHop = {
  fromQ: number;
  fromR: number;
  toQ: number;
  toR: number;
  jump: boolean;
};

export type ChineseState = {
  playerCount: PlayerCount;
  mode: ChineseMode;
  sets: SetCount;
  twoSetGoals: TwoSetGoals;
  owners: (string | null)[];
  pieces: ChinesePiece[];
  turnSeat: number;
  chain: Cell | null;
  finishedSeats: number[];
  resignedSeats: number[];
  finishedTeams: string[];
  over: boolean;
  lastMove: ChineseHop | null;
  lastAction: string | null;
};

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** Clockwise silhouette: tip, valley, tip, valley… starting at the north point. */
export const STAR_OUTLINE: readonly Cell[] = [
  { q: 4, r: -8 },
  { q: 4, r: -4 },
  { q: 8, r: -4 },
  { q: 4, r: 0 },
  { q: 4, r: 4 },
  { q: 0, r: 4 },
  { q: -4, r: 8 },
  { q: -4, r: 4 },
  { q: -8, r: 4 },
  { q: -4, r: 0 },
  { q: -4, r: -4 },
  { q: 0, r: -4 },
];

export const DEFAULT_SETUP: ChineseSetup = {
  playerCount: 6,
  mode: 'ffa',
  sets: 1,
  twoSetGoals: 'opponent',
};

export function normalizeSetup(input?: Partial<ChineseSetup> | null): ChineseSetup {
  const playerCount: PlayerCount =
    input?.playerCount === 2 || input?.playerCount === 3 || input?.playerCount === 4 || input?.playerCount === 6
      ? input.playerCount
      : 6;
  const sets: SetCount =
    playerCount === 2
      ? input?.sets === 2 || input?.sets === 3
        ? input.sets
        : 1
      : playerCount === 3
        ? input?.sets === 2
          ? 2
          : 1
        : 1;
  const mode: ChineseMode = (playerCount === 4 || playerCount === 6) && input?.mode === 'teams' ? 'teams' : 'ffa';
  const twoSetGoals: TwoSetGoals =
    playerCount === 2 && sets === 2 && input?.twoSetGoals === 'empty' ? 'empty' : 'opponent';
  return { playerCount, mode, sets, twoSetGoals };
}

export function sameSetup(a: ChineseSetup, b: ChineseSetup): boolean {
  const x = normalizeSetup(a);
  const y = normalizeSetup(b);
  return x.playerCount === y.playerCount && x.mode === y.mode && x.sets === y.sets && x.twoSetGoals === y.twoSetGoals;
}

export function cellKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function onStar(q: number, r: number): boolean {
  if (!Number.isInteger(q) || !Number.isInteger(r)) return false;
  const s = -q - r;
  const aq = Math.abs(q);
  const ar = Math.abs(r);
  const as = Math.abs(s);
  const max = Math.max(aq, ar, as);
  if (max <= 4) return true;
  if (max > 8) return false;
  return [aq > 4, ar > 4, as > 4].filter(Boolean).length === 1;
}

function buildBoard(): Cell[] {
  const cells: Cell[] = [];
  for (let q = -8; q <= 8; q++) {
    for (let r = -8; r <= 8; r++) {
      if (onStar(q, r)) cells.push({ q, r });
    }
  }
  return cells;
}

export const BOARD: readonly Cell[] = buildBoard();
const BOARD_KEYS = new Set(BOARD.map((cell) => cellKey(cell.q, cell.r)));

export function opposite(corner: Corner): Corner {
  return ((corner + 3) % 6) as Corner;
}

/** Point a piece belongs to, or null when it sits in the center hex. */
export function cornerOf(q: number, r: number): Corner | null {
  if (!onStar(q, r)) return null;
  const s = -q - r;
  const aq = Math.abs(q);
  const ar = Math.abs(r);
  const as = Math.abs(s);
  if (Math.max(aq, ar, as) <= 4) return null;
  if (r <= -5) return 0;
  if (q >= 5) return 1;
  if (s <= -5) return 2;
  if (r >= 5) return 3;
  if (q <= -5) return 4;
  return 5;
}

function onEdge(q: number, r: number, corner: Corner): boolean {
  const s = -q - r;
  if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > 4) return false;
  if (corner === 0) return r === -4;
  if (corner === 1) return q === 4;
  if (corner === 2) return s === -4;
  if (corner === 3) return r === 4;
  if (corner === 4) return q === -4;
  return s === 4;
}

const triangles = new Map<Corner, Cell[]>();
const edges = new Map<Corner, Cell[]>();

function triangle(corner: Corner): Cell[] {
  let cells = triangles.get(corner);
  if (!cells) {
    cells = BOARD.filter((cell) => cornerOf(cell.q, cell.r) === corner);
    triangles.set(corner, cells);
  }
  return cells;
}

function edge(corner: Corner): Cell[] {
  let cells = edges.get(corner);
  if (!cells) {
    cells = BOARD.filter((cell) => cornerOf(cell.q, cell.r) == null && onEdge(cell.q, cell.r, corner));
    edges.set(corner, cells);
  }
  return cells;
}

/** Corners that are somebody’s start or goal. Unused points stay plain. */
export function paintedCamps(setup: ChineseSetup): Corner[] {
  const camps = new Set<Corner>();
  for (const corners of layoutCorners(normalizeSetup(setup))) {
    for (const corner of corners) {
      camps.add(corner);
      camps.add(opposite(corner));
    }
  }
  return [...camps];
}

export function usesFifteen(setup: ChineseSetup): boolean {
  const normalized = normalizeSetup(setup);
  return normalized.playerCount === 2 && normalized.sets === 1;
}

/** Starting or destination holes for a color. The 15-piece game includes the row in front of the point. */
export function campCells(corner: Corner, fifteen: boolean): Cell[] {
  return fifteen ? triangle(corner).concat(edge(corner)) : triangle(corner);
}

export function campAt(q: number, r: number, fifteen: boolean): Corner | null {
  const point = cornerOf(q, r);
  if (point != null) return point;
  if (!fifteen || !onStar(q, r)) return null;
  if (onEdge(q, r, 0)) return 0;
  if (onEdge(q, r, 3)) return 3;
  return null;
}

/**
 * Which colors each seat controls, in turn order.
 * Goals are always the opposite point. Who starts there — opponent, partner, yourself, or nobody —
 * is what the layout decides.
 */
export function layoutCorners(setup: ChineseSetup): Corner[][] {
  const normalized = normalizeSetup(setup);
  if (normalized.playerCount === 6) return [[0], [1], [2], [3], [4], [5]];
  if (normalized.playerCount === 4) return [[0], [1], [3], [4]];
  if (normalized.playerCount === 3) {
    return normalized.sets === 2 ? [[0, 3], [1, 4], [2, 5]] : [[0], [2], [4]];
  }
  if (normalized.sets === 1) return [[0], [3]];
  if (normalized.sets === 3) return [[0, 1, 2], [3, 4, 5]];
  if (normalized.twoSetGoals === 'empty') return [[0, 1], [3, 2]];
  return [[0, 1], [3, 4]];
}

export function setupOf(state: ChineseState): ChineseSetup {
  return normalizeSetup(state);
}

export function seatCorners(state: ChineseState, seat: number): Corner[] {
  return layoutCorners(state)[seat] ?? [];
}

export function teamId(state: ChineseState, seat: number): string | null {
  if (state.mode !== 'teams') return null;
  if (state.playerCount === 6) return `t${seat % 3}`;
  if (state.playerCount === 4) return seat % 2 === 0 ? 't0' : 't1';
  return null;
}

export function seatsOnTeam(state: ChineseState, team: string): number[] {
  const seats: number[] = [];
  for (let seat = 0; seat < state.playerCount; seat++) {
    if (teamId(state, seat) === team) seats.push(seat);
  }
  return seats;
}

export function setupSummary(setup: ChineseSetup): string {
  const normalized = normalizeSetup(setup);
  if (normalized.playerCount === 6) {
    return normalized.mode === 'teams' ? 'Six players · three teams of two' : 'Six players · all versus all';
  }
  if (normalized.playerCount === 4) {
    return normalized.mode === 'teams' ? 'Four players · two teams' : 'Four players · all versus all';
  }
  if (normalized.playerCount === 3) {
    return normalized.sets === 2 ? 'Three players · two sets each' : 'Three players · one set each';
  }
  if (normalized.sets === 1) return 'Two players · 15 pieces each';
  if (normalized.sets === 3) return 'Two players · three sets each';
  return normalized.twoSetGoals === 'empty'
    ? 'Two players · two sets · one into an empty corner'
    : "Two players · two sets · into the opponent's corners";
}

export function setupDetail(setup: ChineseSetup): string {
  const normalized = normalizeSetup(setup);
  if (normalized.playerCount === 6 && normalized.mode === 'teams') {
    return 'Partners sit opposite each other. Each moves their own color into their partner’s corner. The first team with both colors home wins, and the others play on for second and third.';
  }
  if (normalized.playerCount === 6) {
    return 'Each color races into the opposite corner. First home is first place. Everyone else keeps playing for the next places.';
  }
  if (normalized.playerCount === 4 && normalized.mode === 'teams') {
    return 'Two opposite corners stay empty. Partners sit opposite and swap corners. The first team with both colors home wins; the other team plays on for second.';
  }
  if (normalized.playerCount === 4) {
    return 'Two opposite corners stay empty. Each color races into the opposite corner, through the player who started there.';
  }
  if (normalized.playerCount === 3 && normalized.sets === 1) {
    return 'Three colors sit on every other point and race into the empty opposite corners.';
  }
  if (normalized.playerCount === 3) {
    return 'Each player controls the two colors on opposite points and must bring both sets home, swapping those corners.';
  }
  if (normalized.sets === 1) {
    return 'Each side has 15 pieces, filling a point and the row in front of it, and races into the opponent’s camp.';
  }
  if (normalized.sets === 3) {
    return 'Each player controls three neighboring colors. Every set goes into the opponent’s matching corner.';
  }
  if (normalized.twoSetGoals === 'empty') {
    return 'Each player controls two colors. One swaps into the opponent’s corner; the other crosses into an empty opposite corner.';
  }
  return 'Each player controls two neighboring colors. Both sets go into the opponent’s starting corners. The other two points stay empty.';
}

export function goalPhrase(setup: ChineseSetup, corner: Corner): string {
  const normalized = normalizeSetup(setup);
  const dest = opposite(corner);
  const occupied = new Set(layoutCorners(normalized).flat());
  const owner = layoutCorners(normalized).findIndex((corners) => corners.includes(corner));
  const destOwner = layoutCorners(normalized).findIndex((corners) => corners.includes(dest));
  if (!occupied.has(dest)) return `${CORNERS[dest].name} empty corner`;
  if (normalized.mode === 'teams' && owner >= 0 && destOwner >= 0 && teamIdFor(normalized, owner) === teamIdFor(normalized, destOwner)) {
    return `${CORNERS[dest].name}, the partner’s corner`;
  }
  if (owner >= 0 && owner === destOwner) return `${CORNERS[dest].name}, your other set`;
  return `${CORNERS[dest].name}, an opponent’s corner`;
}

function teamIdFor(setup: ChineseSetup, seat: number): string | null {
  if (setup.mode !== 'teams') return null;
  if (setup.playerCount === 6) return `t${seat % 3}`;
  if (setup.playerCount === 4) return seat % 2 === 0 ? 't0' : 't1';
  return null;
}

/** Rotate so a color sits at the bottom of the star. Steps are 60° clockwise. */
export function rotationSteps(corner: Corner): number {
  return (3 - corner + 6) % 6;
}

export function rotateCell(q: number, r: number, steps: number): Cell {
  let cq = q;
  let cr = r;
  const turns = ((steps % 6) + 6) % 6;
  for (let i = 0; i < turns; i++) {
    const s = -cq - cr;
    cq = -cr;
    cr = -s;
  }
  return { q: cq, r: cr };
}

/** Pointy-top axial layout with neighboring holes one unit apart. */
export function cellPixel(q: number, r: number): { x: number; y: number } {
  return { x: q + r / 2, y: (Math.sqrt(3) / 2) * r };
}

export function playerCap(game: { templateId: string; chinese?: { playerCount?: number } | null }, templateMax: number): number {
  if (game.templateId !== 'chinese-checkers') return templateMax;
  const count = game.chinese?.playerCount;
  if (count === 2 || count === 3 || count === 4 || count === 6) return Math.min(templateMax, count);
  return Math.min(templateMax, 6);
}

export function createChineseState(players: readonly { id: string }[], setup?: Partial<ChineseSetup> | null): ChineseState {
  const normalized = normalizeSetup(setup);
  const pieces = startingPieces(normalized);
  return {
    ...normalized,
    owners: assignOwners(normalized.playerCount, players, undefined),
    pieces,
    turnSeat: 0,
    chain: null,
    finishedSeats: [],
    resignedSeats: [],
    finishedTeams: [],
    over: false,
    lastMove: null,
    lastAction: null,
  };
}

export function pieceAt(pieces: readonly ChinesePiece[], q: number, r: number): ChinesePiece | null {
  return pieces.find((piece) => piece.q === q && piece.r === r) ?? null;
}

export function legalHops(state: ChineseState): ChineseHop[] {
  if (state.over) return [];
  if (!isActive(state, state.turnSeat)) return [];
  if (state.chain) {
    const piece = pieceAt(state.pieces, state.chain.q, state.chain.r);
    if (!piece || !seatCorners(state, state.turnSeat).includes(piece.corner)) return [];
    return jumpsFrom(state, piece);
  }
  const mine = seatCorners(state, state.turnSeat);
  const hops: ChineseHop[] = [];
  for (const piece of state.pieces) {
    if (!mine.includes(piece.corner)) continue;
    hops.push(...stepsFrom(state, piece), ...jumpsFrom(state, piece));
  }
  return hops;
}

export function playHop(
  state: ChineseState,
  players: readonly { id: string; name: string }[],
  hop: Pick<ChineseHop, 'fromQ' | 'fromR' | 'toQ' | 'toR'>,
): ChineseState | null {
  if (state.over) return null;
  const match = legalHops(state).find(
    (candidate) =>
      candidate.fromQ === hop.fromQ &&
      candidate.fromR === hop.fromR &&
      candidate.toQ === hop.toQ &&
      candidate.toR === hop.toR,
  );
  if (!match) return null;
  const pieces = movePiece(state.pieces, match);
  if (!pieces) return null;
  const who = seatLabel(state, players, state.turnSeat);
  if (match.jump) {
    const landed = pieceAt(pieces, match.toQ, match.toR);
    const more = landed ? jumpsFrom({ ...state, pieces }, landed) : [];
    if (more.length > 0) {
      return {
        ...state,
        pieces,
        chain: { q: match.toQ, r: match.toR },
        lastMove: match,
        lastAction: `${who} jumps and can jump again.`,
      };
    }
  }
  return finishTurn(
    {
      ...state,
      pieces,
      chain: null,
      lastMove: match,
      lastAction: match.jump ? `${who} jumps.` : `${who} steps.`,
    },
    players,
  );
}

export function stopJumping(state: ChineseState, players: readonly { id: string; name: string }[]): ChineseState | null {
  if (state.over || !state.chain) return null;
  const who = seatLabel(state, players, state.turnSeat);
  return finishTurn({ ...state, chain: null, lastAction: `${who} stops jumping.` }, players);
}

export function resign(state: ChineseState, players: readonly { id: string; name: string }[]): ChineseState | null {
  if (state.over || state.chain || !isActive(state, state.turnSeat)) return null;
  const seat = state.turnSeat;
  const who = seatLabel(state, players, seat);
  const team = teamId(state, seat);
  const dropping =
    team == null
      ? [seat]
      : seatsOnTeam(state, team).filter((index) => isActive(state, index));
  const next: ChineseState = {
    ...state,
    resignedSeats: [...state.resignedSeats, ...dropping],
    chain: null,
    lastAction: team == null ? `${who} resigns.` : `${who} resigns the team.`,
  };
  return finishTurn(awardLastRemaining(next, players), players);
}

export function homeProgress(state: ChineseState, seat: number): { home: number; total: number } {
  const fifteen = usesFifteen(state);
  let home = 0;
  let total = 0;
  for (const corner of seatCorners(state, seat)) {
    const dest = destinationKeys(corner, fifteen);
    for (const piece of state.pieces) {
      if (piece.corner !== corner) continue;
      total += 1;
      if (dest.has(cellKey(piece.q, piece.r))) home += 1;
    }
  }
  return { home, total };
}

export type PlaceRow = {
  place: number;
  seats: number[];
  resigned: boolean;
};

/** Finishers in arrival order, then players who resigned. Places stay open until someone finishes or bows out. */
export function placeRows(state: ChineseState): PlaceRow[] {
  if (state.mode === 'teams') {
    const rows: PlaceRow[] = state.finishedTeams.map((team, index) => ({
      place: index + 1,
      seats: seatsOnTeam(state, team),
      resigned: false,
    }));
    const seen = new Set(state.finishedTeams);
    const resignedTeams: string[] = [];
    for (const seat of state.resignedSeats) {
      const team = teamId(state, seat);
      if (!team || seen.has(team)) continue;
      seen.add(team);
      resignedTeams.push(team);
    }
    resignedTeams.reverse().forEach((team) => {
      rows.push({ place: rows.length + 1, seats: seatsOnTeam(state, team), resigned: true });
    });
    return rows;
  }
  const rows: PlaceRow[] = state.finishedSeats.map((seat, index) => ({
    place: index + 1,
    seats: [seat],
    resigned: false,
  }));
  [...state.resignedSeats].reverse().forEach((seat) => {
    rows.push({ place: rows.length + 1, seats: [seat], resigned: true });
  });
  return rows;
}

export function winnerPlayerIds(state: ChineseState): string[] {
  if (!state.over) return [];
  const first = placeRows(state).find((row) => !row.resigned);
  if (!first) return [];
  const ids: string[] = [];
  for (const seat of first.seats) {
    const id = state.owners[seat];
    if (id) ids.push(id);
  }
  return ids;
}

export function piecesHomeForPlayer(state: ChineseState, playerId: string): number {
  const seat = state.owners.indexOf(playerId);
  if (seat < 0) return 0;
  return homeProgress(state, seat).home;
}

export function ensureChineseState(game: Game): Game {
  if (game.templateId !== 'chinese-checkers') return game;
  if (game.chinese && isHealthy(game.chinese, game.players)) return game;
  return { ...game, chinese: repairChineseState(game) };
}

export function seatLabel(state: ChineseState, players: readonly { id: string; name: string }[], seat: number): string {
  const owner = state.owners[seat];
  const player = owner ? players.find((item) => item.id === owner) : undefined;
  const colors = seatCorners(state, seat)
    .map((corner) => CORNERS[corner].name)
    .join(' & ');
  return player ? `${player.name} (${colors})` : colors;
}

function startingPieces(setup: ChineseSetup): ChinesePiece[] {
  const fifteen = usesFifteen(setup);
  const pieces: ChinesePiece[] = [];
  for (const corners of layoutCorners(setup)) {
    for (const corner of corners) {
      for (const cell of campCells(corner, fifteen)) {
        pieces.push({ q: cell.q, r: cell.r, corner });
      }
    }
  }
  return sortPieces(pieces);
}

function destinationKeys(corner: Corner, fifteen: boolean): Set<string> {
  return new Set(campCells(opposite(corner), fifteen).map((cell) => cellKey(cell.q, cell.r)));
}

function canStop(state: ChineseState, q: number, r: number, corner: Corner): boolean {
  if (!BOARD_KEYS.has(cellKey(q, r))) return false;
  const camp = campAt(q, r, usesFifteen(state));
  if (camp == null) return true;
  return camp === corner || camp === opposite(corner);
}

function stepsFrom(state: ChineseState, piece: ChinesePiece): ChineseHop[] {
  const hops: ChineseHop[] = [];
  for (const [dq, dr] of DIRS) {
    const toQ = piece.q + dq;
    const toR = piece.r + dr;
    if (pieceAt(state.pieces, toQ, toR) || !canStop(state, toQ, toR, piece.corner)) continue;
    hops.push({ fromQ: piece.q, fromR: piece.r, toQ, toR, jump: false });
  }
  return hops;
}

function jumpsFrom(state: ChineseState, piece: ChinesePiece): ChineseHop[] {
  const hops: ChineseHop[] = [];
  for (const [dq, dr] of DIRS) {
    const overQ = piece.q + dq;
    const overR = piece.r + dr;
    const toQ = piece.q + dq * 2;
    const toR = piece.r + dr * 2;
    if (!BOARD_KEYS.has(cellKey(overQ, overR)) || !pieceAt(state.pieces, overQ, overR)) continue;
    if (pieceAt(state.pieces, toQ, toR) || !canStop(state, toQ, toR, piece.corner)) continue;
    hops.push({ fromQ: piece.q, fromR: piece.r, toQ, toR, jump: true });
  }
  return hops;
}

function movePiece(pieces: readonly ChinesePiece[], hop: ChineseHop): ChinesePiece[] | null {
  const moving = pieceAt(pieces, hop.fromQ, hop.fromR);
  if (!moving || pieceAt(pieces, hop.toQ, hop.toR)) return null;
  return sortPieces(
    pieces.map((piece) =>
      piece.q === hop.fromQ && piece.r === hop.fromR ? { ...piece, q: hop.toQ, r: hop.toR } : piece,
    ),
  );
}

function finishTurn(state: ChineseState, players: readonly { id: string; name: string }[]): ChineseState {
  const settled = settle(state, players);
  if (settled.over) return { ...settled, chain: null };
  const nextSeat = nextActive(settled, settled.turnSeat);
  if (nextSeat == null) return { ...settled, over: true, chain: null };
  return { ...settled, turnSeat: nextSeat, chain: null };
}

/** A resignation that leaves one seat or one team ends the race. They take the next place. */
function awardLastRemaining(state: ChineseState, players: readonly { id: string; name: string }[]): ChineseState {
  const active: number[] = [];
  for (let seat = 0; seat < state.playerCount; seat++) {
    if (isActive(state, seat)) active.push(seat);
  }
  if (state.mode === 'teams') {
    const teams = [...new Set(active.map((seat) => teamId(state, seat)).filter((team): team is string => Boolean(team)))];
    if (teams.length !== 1) return state;
    return { ...state, finishedSeats: [...state.finishedSeats, ...active] };
  }
  if (active.length !== 1) return state;
  const seat = active[0];
  const place = state.finishedSeats.length + 1;
  return {
    ...state,
    finishedSeats: [...state.finishedSeats, seat],
    lastAction: `${state.lastAction ?? ''} ${seatLabel(state, players, seat)} takes ${ordinal(place)}.`.trim(),
  };
}

function settle(state: ChineseState, players: readonly { id: string; name: string }[]): ChineseState {
  const finished = [...state.finishedSeats];
  const notes: string[] = [];
  for (let seat = 0; seat < state.playerCount; seat++) {
    if (finished.includes(seat) || state.resignedSeats.includes(seat)) continue;
    if (!seatIsHome(state, seat)) continue;
    finished.push(seat);
    notes.push(`${seatLabel(state, players, seat)} is home.`);
  }
  let finishedTeams = [...state.finishedTeams];
  if (state.mode === 'teams') {
    for (let seat = 0; seat < state.playerCount; seat++) {
      const team = teamId(state, seat);
      if (!team || finishedTeams.includes(team)) continue;
      const members = seatsOnTeam(state, team);
      if (members.length === 0 || !members.every((index) => finished.includes(index))) continue;
      finishedTeams.push(team);
      const names = members.map((index) => seatLabel(state, players, index)).join(' and ');
      notes.push(`${names} take ${ordinal(finishedTeams.length)}.`);
    }
  } else if (notes.length > 0) {
    const seat = finished[finished.length - 1];
    notes[notes.length - 1] = `${seatLabel(state, players, seat)} takes ${ordinal(finished.length)}.`;
  }
  const over = Array.from({ length: state.playerCount }, (_, seat) => finished.includes(seat) || state.resignedSeats.includes(seat)).every(
    Boolean,
  );
  const extra = notes.length > 0 ? ` ${notes.join(' ')}` : '';
  return {
    ...state,
    finishedSeats: finished,
    finishedTeams,
    over,
    chain: null,
    lastAction: `${state.lastAction ?? ''}${extra}`.trim() || null,
  };
}

function seatIsHome(state: ChineseState, seat: number): boolean {
  const progress = homeProgress(state, seat);
  return progress.total > 0 && progress.home === progress.total;
}

function isActive(state: ChineseState, seat: number): boolean {
  return seat >= 0 && seat < state.playerCount && !state.finishedSeats.includes(seat) && !state.resignedSeats.includes(seat);
}

function nextActive(state: ChineseState, afterSeat: number): number | null {
  for (let step = 1; step <= state.playerCount; step++) {
    const seat = (afterSeat + step) % state.playerCount;
    if (isActive(state, seat)) return seat;
  }
  return null;
}

function ordinal(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;
  const digit = place % 10;
  if (digit === 1) return `${place}st`;
  if (digit === 2) return `${place}nd`;
  if (digit === 3) return `${place}rd`;
  return `${place}th`;
}

function assignOwners(
  playerCount: number,
  players: readonly { id: string }[],
  previous: readonly (string | null)[] | undefined,
): (string | null)[] {
  const owners: (string | null)[] = Array.from({ length: playerCount }, () => null);
  const used = new Set<string>();
  if (previous) {
    for (let seat = 0; seat < playerCount && seat < previous.length; seat++) {
      const id = previous[seat];
      if (typeof id === 'string' && players.some((player) => player.id === id) && !used.has(id)) {
        owners[seat] = id;
        used.add(id);
      }
    }
  }
  for (const player of players) {
    if (used.has(player.id)) continue;
    const open = owners.indexOf(null);
    if (open < 0) break;
    owners[open] = player.id;
    used.add(player.id);
  }
  return owners;
}

function sortPieces(pieces: readonly ChinesePiece[]): ChinesePiece[] {
  return [...pieces].sort((a, b) => a.corner - b.corner || a.r - b.r || a.q - b.q);
}

function repairChineseState(game: Game): ChineseState {
  const previous = game.chinese;
  const setup = normalizeSetup(previous);
  const fifteen = usesFifteen(setup);
  const cleaned = previous ? cleanPieces(previous.pieces, setup, fifteen) : null;
  const pieces = cleaned ?? startingPieces(setup);
  const kept = cleaned != null;
  const base: ChineseState = {
    ...setup,
    owners: assignOwners(setup.playerCount, game.players, previous?.owners),
    pieces,
    turnSeat: 0,
    chain: null,
    finishedSeats: [],
    resignedSeats: [],
    finishedTeams: [],
    over: false,
    lastMove: kept ? cleanHop(previous?.lastMove) : null,
    lastAction: typeof previous?.lastAction === 'string' ? previous.lastAction.slice(0, 240) : null,
  };
  const storedFinished = kept ? cleanSeatList(previous?.finishedSeats, setup.playerCount) : [];
  const resigned = (kept ? cleanSeatList(previous?.resignedSeats, setup.playerCount) : []).filter(
    (seat) => !storedFinished.includes(seat),
  );
  const finished = storedFinished.filter((seat) => !resigned.includes(seat));
  for (let seat = 0; seat < setup.playerCount; seat++) {
    if (resigned.includes(seat) || finished.includes(seat)) continue;
    if (seatIsHome(base, seat)) finished.push(seat);
  }
  const withSeats: ChineseState = { ...base, finishedSeats: finished, resignedSeats: resigned };
  let finishedTeams: string[] = [];
  if (setup.mode === 'teams') {
    const stored = Array.isArray(previous?.finishedTeams)
      ? previous.finishedTeams.filter((team): team is string => typeof team === 'string')
      : [];
    finishedTeams = stored.filter((team) => {
      const members = seatsOnTeam(withSeats, team);
      return members.length > 0 && members.every((seat) => finished.includes(seat));
    });
    for (let seat = 0; seat < setup.playerCount; seat++) {
      const team = teamId(withSeats, seat);
      if (!team || finishedTeams.includes(team)) continue;
      const members = seatsOnTeam(withSeats, team);
      if (members.every((index) => finished.includes(index))) finishedTeams.push(team);
    }
  }
  const restored: ChineseState = { ...withSeats, finishedTeams };
  const over = Array.from({ length: setup.playerCount }, (_, seat) => finished.includes(seat) || resigned.includes(seat)).every(
    Boolean,
  );
  let turnSeat =
    kept && Number.isInteger(previous?.turnSeat) && (previous?.turnSeat as number) >= 0 && (previous?.turnSeat as number) < setup.playerCount
      ? (previous?.turnSeat as number)
      : 0;
  const chain = kept && !over ? cleanChain(previous?.chain, restored, turnSeat) : null;
  if (!over && !chain && !isActive(restored, turnSeat)) {
    turnSeat = nextActive(restored, turnSeat) ?? turnSeat;
  }
  return { ...restored, turnSeat, chain, over };
}

function cleanPieces(value: unknown, setup: ChineseSetup, fifteen: boolean): ChinesePiece[] | null {
  if (!Array.isArray(value)) return null;
  const expected = new Map<Corner, number>();
  for (const corners of layoutCorners(setup)) {
    for (const corner of corners) expected.set(corner, campCells(corner, fifteen).length);
  }
  const pieces: ChinesePiece[] = [];
  const seen = new Set<string>();
  const counts = new Map<Corner, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Partial<ChinesePiece>;
    if (typeof raw.q !== 'number' || typeof raw.r !== 'number' || !onStar(raw.q, raw.r)) return null;
    if (!isCorner(raw.corner) || !expected.has(raw.corner)) return null;
    const key = cellKey(raw.q, raw.r);
    if (seen.has(key)) return null;
    seen.add(key);
    counts.set(raw.corner, (counts.get(raw.corner) ?? 0) + 1);
    pieces.push({ q: raw.q, r: raw.r, corner: raw.corner });
  }
  for (const [corner, count] of expected) {
    if (counts.get(corner) !== count) return null;
  }
  if (pieces.length !== [...expected.values()].reduce((sum, count) => sum + count, 0)) return null;
  return sortPieces(pieces);
}

function cleanSeatList(value: unknown, playerCount: number): number[] {
  if (!Array.isArray(value)) return [];
  const seats: number[] = [];
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item >= playerCount) continue;
    if (!seats.includes(item)) seats.push(item);
  }
  return seats;
}

function cleanHop(value: unknown): ChineseHop | null {
  if (!value || typeof value !== 'object') return null;
  const hop = value as Partial<ChineseHop>;
  if (!onStar(hop.fromQ as number, hop.fromR as number) || !onStar(hop.toQ as number, hop.toR as number)) return null;
  return {
    fromQ: hop.fromQ as number,
    fromR: hop.fromR as number,
    toQ: hop.toQ as number,
    toR: hop.toR as number,
    jump: hop.jump === true,
  };
}

function cleanChain(value: unknown, state: ChineseState, turnSeat: number): Cell | null {
  if (!value || typeof value !== 'object') return null;
  const cell = value as Partial<Cell>;
  if (typeof cell.q !== 'number' || typeof cell.r !== 'number') return null;
  const piece = pieceAt(state.pieces, cell.q, cell.r);
  if (!piece || !seatCorners({ ...state, turnSeat }, turnSeat).includes(piece.corner)) return null;
  if (jumpsFrom({ ...state, turnSeat }, piece).length === 0) return null;
  return { q: cell.q, r: cell.r };
}

function isCorner(value: unknown): value is Corner {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function isHealthy(state: ChineseState, players: Player[]): boolean {
  return sameState(state, repairChineseState({ chinese: state, players } as Game));
}

function sameState(a: ChineseState, b: ChineseState): boolean {
  return (
    sameSetup(a, b) &&
    a.turnSeat === b.turnSeat &&
    a.over === b.over &&
    a.lastAction === b.lastAction &&
    sameOwners(a.owners, b.owners) &&
    sameCells(a.chain, b.chain) &&
    sameHop(a.lastMove, b.lastMove) &&
    sameNumbers(a.finishedSeats, b.finishedSeats) &&
    sameNumbers(a.resignedSeats, b.resignedSeats) &&
    sameStrings(a.finishedTeams, b.finishedTeams) &&
    samePieces(a.pieces, b.pieces)
  );
}

function samePieces(a: readonly ChinesePiece[], b: readonly ChinesePiece[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (piece, index) => piece.q === b[index].q && piece.r === b[index].r && piece.corner === b[index].corner,
    )
  );
}

function sameOwners(a: readonly (string | null)[], b: readonly (string | null)[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameCells(a: Cell | null, b: Cell | null): boolean {
  if (!a || !b) return a === b;
  return a.q === b.q && a.r === b.r;
}

function sameHop(a: ChineseHop | null, b: ChineseHop | null): boolean {
  if (!a || !b) return a === b;
  return a.fromQ === b.fromQ && a.fromR === b.fromR && a.toQ === b.toQ && a.toR === b.toR && a.jump === b.jump;
}

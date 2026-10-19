import {
  legalHops,
  playHop,
  type AiDifficulty,
  type CheckersHop,
  type CheckersState,
  type Side,
} from './checkers';

const SEARCH_PLAYERS = [
  { id: 'dark-seat', name: 'Black' },
  { id: 'light-seat', name: 'Red' },
] as const;

const DEPTH: Record<AiDifficulty, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

/**
 * Pick the next hop for the side to move. Easy mixes in randomness; medium and
 * hard use alpha-beta with piece and mobility evaluation.
 */
export function chooseCheckersHop(
  state: CheckersState,
  difficulty: AiDifficulty = 'medium',
): CheckersHop | null {
  const hops = legalHops(state);
  if (hops.length === 0) return null;
  if (hops.length === 1) return hops[0];
  if (difficulty === 'easy') return pickEasy(state, hops);

  const rootSide = state.turn;
  const depth = DEPTH[difficulty];
  let best = hops[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  let alpha = Number.NEGATIVE_INFINITY;
  const beta = Number.POSITIVE_INFINITY;

  for (const hop of orderHops(hops)) {
    const next = playHop(withSearchSeats(state), SEARCH_PLAYERS, hop);
    if (!next) continue;
    const childDepth = next.chain && next.turn === state.turn ? depth : depth - 1;
    const score = search(next, childDepth, alpha, beta, rootSide);
    if (score > bestScore) {
      bestScore = score;
      best = hop;
    }
    if (score > alpha) alpha = score;
  }
  return best;
}

/** Computer accepts a draw only when clearly behind on medium/hard. */
export function chooseDrawAnswer(state: CheckersState, difficulty: AiDifficulty): boolean {
  if (difficulty === 'easy') return Math.random() < 0.35;
  const side = state.aiPlayerId ? state.sides[state.aiPlayerId] : null;
  if (side !== 'dark' && side !== 'light') return false;
  const score = evaluate(state, side);
  return difficulty === 'medium' ? score < -120 : score < -220;
}

function pickEasy(state: CheckersState, hops: CheckersHop[]): CheckersHop {
  const captures = hops.filter((hop) => hop.captureRow != null);
  const pool = captures.length > 0 && Math.random() < 0.7 ? captures : hops;
  if (Math.random() < 0.55) return pool[Math.floor(Math.random() * pool.length)]!;

  let best = pool[0]!;
  let bestScore = Number.NEGATIVE_INFINITY;
  const rootSide = state.turn;
  for (const hop of pool) {
    const next = playHop(withSearchSeats(state), SEARCH_PLAYERS, hop);
    if (!next) continue;
    const score = evaluate(next, rootSide);
    if (score > bestScore) {
      bestScore = score;
      best = hop;
    }
  }
  return best;
}

function search(
  state: CheckersState,
  depth: number,
  alpha: number,
  beta: number,
  rootSide: Side,
): number {
  if (state.winnerSide) {
    return state.winnerSide === rootSide ? 50_000 + depth : -50_000 - depth;
  }
  if (state.draw) return 0;
  if (depth <= 0) return evaluate(state, rootSide);

  const hops = legalHops(state);
  if (hops.length === 0) {
    return state.turn === rootSide ? -50_000 - depth : 50_000 + depth;
  }

  const maximizing = state.turn === rootSide;
  if (maximizing) {
    let best = Number.NEGATIVE_INFINITY;
    for (const hop of orderHops(hops)) {
      const next = playHop(withSearchSeats(state), SEARCH_PLAYERS, hop);
      if (!next) continue;
      const childDepth = next.chain && next.turn === state.turn ? depth : depth - 1;
      const score = search(next, childDepth, alpha, beta, rootSide);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const hop of orderHops(hops)) {
    const next = playHop(withSearchSeats(state), SEARCH_PLAYERS, hop);
    if (!next) continue;
    const childDepth = next.chain && next.turn === state.turn ? depth : depth - 1;
    const score = search(next, childDepth, alpha, beta, rootSide);
    if (score < best) best = score;
    if (score < beta) beta = score;
    if (alpha >= beta) break;
  }
  return best;
}

function evaluate(state: CheckersState, rootSide: Side): number {
  if (state.winnerSide) return state.winnerSide === rootSide ? 50_000 : -50_000;
  if (state.draw) return 0;

  let score = 0;
  for (const piece of state.pieces) {
    const sign = piece.side === rootSide ? 1 : -1;
    const material = piece.kind === 'king' ? 175 : 100;
    const advance =
      piece.kind === 'man'
        ? piece.side === 'dark'
          ? 7 - piece.row
          : piece.row
        : 0;
    const center = 3.5 - Math.abs(piece.col - 3.5) + (3.5 - Math.abs(piece.row - 3.5));
    score += sign * (material + advance * 6 + center * 2);
  }

  const mobility = legalHops(state).length;
  score += (state.turn === rootSide ? 1 : -1) * mobility * 3;
  return score;
}

function orderHops(hops: readonly CheckersHop[]): CheckersHop[] {
  return [...hops].sort((a, b) => {
    const aCap = a.captureRow != null ? 1 : 0;
    const bCap = b.captureRow != null ? 1 : 0;
    return bCap - aCap;
  });
}

/** Map the live sides onto the fixed search seats so playHop can name movers. */
function withSearchSeats(state: CheckersState): CheckersState {
  return {
    ...state,
    sides: { 'dark-seat': 'dark', 'light-seat': 'light' },
  };
}

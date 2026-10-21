import type { Game } from './models';
import { borneOff, playerIdForSide as backgammonPlayerId } from './backgammon';
import { capturedCount, playerIdForSide } from './checkers';
import { scoreForPlayer as canastaScore, winnerIds as canastaWinners } from './canasta';
import { scoreForPlayer as uneauxScore, winnerIds as uneauxWinners } from './uneaux';
import { scoreForPlayer as skipBeauxScore, winnerIds as skipBeauxWinners } from './skipBeaux';
import { capturedValue, playerIdForSide as chessPlayerId } from './chess';
import { discCount, playerIdForSide as reversiPlayerId } from './reversi';
import { piecesHomeForPlayer, winnerPlayerIds } from './chineseCheckers';
import { homeCount as freecellHome } from './freecell';
import { foundationCount } from './klondike';
import { clearedCount } from './pyramid';
import { completedCount } from './spider';
import { homeCount } from './sorry';
import { homeCount as parcheesiHome } from './parcheesi';
import { soleSolventPlayer, cashFromDelta } from './opoly';
import { grandTotal, isScorecardComplete } from './yaht';

export type BoardOutcome = {
  /** Null means the player has no board yet, so the score events decide. */
  points?: (game: Game, playerId: string) => number | null;
  /** This replaces the score-total completion rules. */
  complete?: (game: Game, totals: Map<string, number>) => boolean;
  /**
   * An array names the winners. Null leaves the score-total rules in place.
   */
  winners?: (game: Game, totals: Map<string, number>) => string[] | null;
};

function seat(game: Game): string[] {
  const id = game.players[0]?.id;
  return id ? [id] : [];
}

function opolySole(game: Game, totals: Map<string, number>): string | null {
  if (game.templateId !== 'monopoly') return null;
  return soleSolventPlayer(game.players, (playerId) => cashFromDelta(totals.get(playerId) ?? 0));
}

/** How a board names points, completion, and winners. Score pads are absent and use events. */
export const boardOutcomes: Record<string, BoardOutcome> = {
  yaht: {
    points: (game, playerId) => grandTotal(game.events, playerId),
    complete: (game) => isScorecardComplete(game),
    winners: () => null,
  },
  sorry: {
    points: (game, playerId) => (game.sorry ? homeCount(game.sorry, playerId) : null),
    winners: (game) => (game.sorry?.winnerId ? [game.sorry.winnerId] : []),
  },
  parcheesi: {
    points: (game, playerId) => (game.parcheesi ? parcheesiHome(game.parcheesi, playerId) : null),
    complete: (game) => Boolean(game.parcheesi?.winnerId),
    winners: (game) => (game.parcheesi?.winnerId ? [game.parcheesi.winnerId] : []),
  },
  backgammon: {
    points: (game, playerId) => (game.backgammon ? borneOff(game.backgammon, playerId) : null),
    complete: (game) => Boolean(game.backgammon?.winnerSide),
    winners: (game) => {
      if (!game.backgammon?.winnerSide) return [];
      const winnerId = backgammonPlayerId(game.backgammon, game.backgammon.winnerSide);
      return winnerId ? [winnerId] : [];
    },
  },
  checkers: {
    points: (game, playerId) => (game.checkers ? capturedCount(game.checkers, playerId) : null),
    complete: (game) => Boolean(game.checkers?.winnerSide || game.checkers?.draw),
    winners: (game) => {
      if (!game.checkers || game.checkers.draw || !game.checkers.winnerSide) return [];
      const winnerId = playerIdForSide(game.checkers, game.checkers.winnerSide);
      return winnerId ? [winnerId] : [];
    },
  },
  chess: {
    points: (game, playerId) => (game.chess ? capturedValue(game.chess, playerId) : null),
    complete: (game) => Boolean(game.chess?.winnerSide || game.chess?.draw),
    winners: (game) => {
      if (!game.chess || game.chess.draw || !game.chess.winnerSide) return [];
      const winnerId = chessPlayerId(game.chess, game.chess.winnerSide);
      return winnerId ? [winnerId] : [];
    },
  },
  canasta: {
    points: (game, playerId) => (game.canasta ? canastaScore(game.canasta, playerId) : null),
    complete: (game) => game.canasta?.phase === 'gameOver',
    winners: (game) => (game.canasta ? canastaWinners(game.canasta) : []),
  },
  uneaux: {
    points: (game, playerId) => (game.uneaux ? uneauxScore(game.uneaux, playerId) : null),
    complete: (game) => game.uneaux?.phase === 'gameOver',
    winners: (game) => (game.uneaux ? uneauxWinners(game.uneaux) : []),
  },
  'skip-beaux': {
    points: (game, playerId) => (game.skipBeaux ? skipBeauxScore(game.skipBeaux, playerId) : null),
    complete: (game) => game.skipBeaux?.phase === 'gameOver',
    winners: (game) => (game.skipBeaux ? skipBeauxWinners(game.skipBeaux) : []),
  },
  reversi: {
    points: (game, playerId) => (game.reversi ? discCount(game.reversi, playerId) : null),
    complete: (game) => Boolean(game.reversi?.winnerSide || game.reversi?.draw),
    winners: (game) => {
      if (!game.reversi || game.reversi.draw || !game.reversi.winnerSide) return [];
      const winnerId = reversiPlayerId(game.reversi, game.reversi.winnerSide);
      return winnerId ? [winnerId] : [];
    },
  },
  'chinese-checkers': {
    points: (game, playerId) => (game.chinese ? piecesHomeForPlayer(game.chinese, playerId) : null),
    complete: (game) => Boolean(game.chinese?.over),
    winners: (game) => (game.chinese?.over ? winnerPlayerIds(game.chinese) : []),
  },
  klondike: {
    points: (game) => foundationCount(game.klondike),
    complete: (game) => Boolean(game.klondike?.won),
    winners: (game) => (game.klondike?.won ? seat(game) : []),
  },
  freecell: {
    points: (game) => freecellHome(game.freecell),
    complete: (game) => Boolean(game.freecell?.won),
    winners: (game) => (game.freecell?.won ? seat(game) : []),
  },
  pyramid: {
    points: (game) => clearedCount(game.pyramid),
    complete: (game) => Boolean(game.pyramid?.won),
    winners: (game) => (game.pyramid?.won ? seat(game) : []),
  },
  spider: {
    points: (game) => completedCount(game.spider),
    complete: (game) => Boolean(game.spider?.won),
    winners: (game) => (game.spider?.won ? seat(game) : []),
  },
  tripeaks: {
    points: (game) => game.tripeaks?.score ?? 0,
    complete: (game) => Boolean(game.tripeaks?.won),
    winners: (game) => (game.tripeaks?.won ? seat(game) : []),
  },
  monopoly: {
    complete: (game, totals) => Boolean(opolySole(game, totals)),
    winners: (game, totals) => {
      const winnerId = opolySole(game, totals);
      return winnerId ? [winnerId] : null;
    },
  },
};

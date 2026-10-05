import type { Game, Player } from './models';
import type { GameTemplate, WinCondition } from './templates';
import { borneOff, playerIdForSide as backgammonPlayerId } from './backgammon';
import { capturedCount, playerIdForSide } from './checkers';
import { piecesHomeForPlayer, winnerPlayerIds } from './chineseCheckers';
import { foundationCount } from './klondike';
import { clearedCount } from './pyramid';
import { completedCount } from './spider';
import { homeCount } from './sorry';
import { grandTotal, isScorecardComplete } from './yahtzee';

export interface PlayerStanding {
  playerId: string;
  playerName: string;
  total: number;
  rank: number;
  isLeader: boolean;
  isWinner: boolean;
}

export interface GameSnapshot {
  standings: PlayerStanding[];
  currentRound: number;
  isComplete: boolean;
  winnerName: string | null;
}

export function calculate(game: Game, template: GameTemplate): GameSnapshot {
  const totals = new Map<string, number>();
  for (const player of game.players) {
    totals.set(player.id, pointsForPlayer(game, player.id, template));
  }

  const currentRound = game.events
    .map((e) => e.roundNumber ?? 0)
    .reduce((max, n) => Math.max(max, n), 0);

  const ordered = orderPlayers(game.players, totals, template.winCondition);
  const isComplete = game.status === 'Completed' || detectCompletion(game, template, totals);

  const winnerIds = isComplete ? getWinnerIds(ordered, totals, template, game) : new Set<string>();

  const standings: PlayerStanding[] = ordered.map((player, index) => {
    const total = totals.get(player.id) ?? 0;
    const isWinner = winnerIds.has(player.id);
    const isLeader =
      index === 0 && ordered.length > 0 && (totals.get(ordered[0].id) ?? 0) === total;
    return {
      playerId: player.id,
      playerName: player.name,
      total,
      rank: index + 1,
      isLeader: isLeader && !isComplete,
      isWinner,
    };
  });

  return {
    standings,
    currentRound,
    isComplete,
    winnerName: standings.find((s) => s.isWinner)?.playerName ?? null,
  };
}

export function nextRoundNumber(game: Game): number {
  const max = game.events
    .map((e) => e.roundNumber ?? 0)
    .reduce((m, n) => Math.max(m, n), 0);
  return max + 1;
}

function orderPlayers(
  players: Player[],
  totals: Map<string, number>,
  winCondition: WinCondition,
): Player[] {
  const list = [...players];
  if (winCondition === 'LowestTotal') {
    return list.sort(
      (a, b) =>
        (totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }
  return list.sort(
    (a, b) =>
      (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );
}

function pointsForPlayer(game: Game, playerId: string, template: GameTemplate): number {
  if (template.id === 'yahtzee') return grandTotal(game.events, playerId);
  if (template.id === 'sorry' && game.sorry) return homeCount(game.sorry, playerId);
  if (template.id === 'backgammon' && game.backgammon) return borneOff(game.backgammon, playerId);
  if (template.id === 'checkers' && game.checkers) return capturedCount(game.checkers, playerId);
  if (template.id === 'chinese-checkers' && game.chinese) return piecesHomeForPlayer(game.chinese, playerId);
  if (template.id === 'klondike') return foundationCount(game.klondike);
  if (template.id === 'pyramid') return clearedCount(game.pyramid);
  if (template.id === 'spider') return completedCount(game.spider);
  return game.events
    .filter((e) => e.playerId === playerId)
    .reduce((sum, e) => sum + e.points, 0);
}

function highestRound(game: Game, playerId: string): number {
  let high = 0;
  for (const event of game.events) {
    if (event.playerId === playerId) high = Math.max(high, event.roundNumber ?? 0);
  }
  return high;
}

/** Lowest hole/round that every player has already entered. */
function roundsEveryoneReached(game: Game): number {
  if (game.players.length === 0) return 0;
  let least = Number.POSITIVE_INFINITY;
  for (const player of game.players) least = Math.min(least, highestRound(game, player.id));
  return least;
}

function detectCompletion(game: Game, template: GameTemplate, totals: Map<string, number>): boolean {
  if (template.id === 'yahtzee') return isScorecardComplete(game);
  if (template.id === 'backgammon') return Boolean(game.backgammon?.winnerSide);
  if (template.id === 'checkers') return Boolean(game.checkers?.winnerSide || game.checkers?.draw);
  if (template.id === 'chinese-checkers') return Boolean(game.chinese?.over);
  if (template.id === 'klondike') return Boolean(game.klondike?.won);
  if (template.id === 'pyramid') return Boolean(game.pyramid?.won);
  if (template.id === 'spider') return Boolean(game.spider?.won);

  if (template.winCondition === 'FirstToTarget') {
    const target = game.targetScore ?? template.defaultTargetScore;
    if (target != null && target > 0 && [...totals.values()].some((value) => value >= target)) return true;
  }

  const maxRounds = game.maxRounds ?? template.defaultMaxRounds;
  if (maxRounds != null && maxRounds > 0 && roundsEveryoneReached(game) >= maxRounds) return true;

  return false;
}

function firstCrossingPlayerId(game: Game, target: number): string | null {
  const running = new Map<string, number>();
  const events = [...game.events].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
  for (const event of events) {
    const total = (running.get(event.playerId) ?? 0) + event.points;
    running.set(event.playerId, total);
    if (total >= target) return event.playerId;
  }
  return null;
}

function getWinnerIds(
  ordered: Player[],
  totals: Map<string, number>,
  template: GameTemplate,
  game: Game,
): Set<string> {
  if (ordered.length === 0) return new Set();

  if (template.id === 'backgammon') {
    if (!game.backgammon?.winnerSide) return new Set();
    const winnerId = backgammonPlayerId(game.backgammon, game.backgammon.winnerSide);
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.id === 'checkers') {
    if (!game.checkers || game.checkers.draw || !game.checkers.winnerSide) return new Set();
    const winnerId = playerIdForSide(game.checkers, game.checkers.winnerSide);
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.id === 'chinese-checkers') {
    if (!game.chinese?.over) return new Set();
    return new Set(winnerPlayerIds(game.chinese));
  }

  if (template.id === 'sorry') {
    const winnerId = game.sorry?.winnerId;
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.id === 'klondike') {
    if (!game.klondike?.won) return new Set();
    const winnerId = game.players[0]?.id;
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.id === 'pyramid') {
    if (!game.pyramid?.won) return new Set();
    const winnerId = game.players[0]?.id;
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.id === 'spider') {
    if (!game.spider?.won) return new Set();
    const winnerId = game.players[0]?.id;
    return winnerId ? new Set([winnerId]) : new Set();
  }

  if (template.winCondition === 'FirstToTarget') {
    const target = game.targetScore ?? template.defaultTargetScore ?? 0;
    if (target <= 0) return new Set();
    const winnerId = firstCrossingPlayerId(game, target);
    return winnerId ? new Set([winnerId]) : new Set();
  }

  const winningTotal = totals.get(ordered[0].id) ?? 0;
  return new Set(ordered.filter((p) => (totals.get(p.id) ?? 0) === winningTotal).map((p) => p.id));
}

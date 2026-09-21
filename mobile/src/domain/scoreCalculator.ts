import type { Game, Player } from './models';
import type { GameTemplate, WinCondition } from './templates';

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
    totals.set(
      player.id,
      game.events.filter((e) => e.playerId === player.id).reduce((sum, e) => sum + e.points, 0),
    );
  }

  const currentRound = game.events
    .map((e) => e.roundNumber ?? 0)
    .reduce((max, n) => Math.max(max, n), 0);

  const ordered = orderPlayers(game.players, totals, template.winCondition);
  const isComplete =
    game.status === 'Completed' || detectCompletion(game, template, totals, currentRound);

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

function detectCompletion(
  game: Game,
  template: GameTemplate,
  totals: Map<string, number>,
  currentRound: number,
): boolean {
  if (template.winCondition === 'FirstToTarget') {
    const target = game.targetScore ?? template.defaultTargetScore;
    if (target != null && [...totals.values()].some((v) => v >= target)) return true;
  }

  const maxRounds = game.maxRounds ?? template.defaultMaxRounds;
  if (maxRounds != null && currentRound >= maxRounds) return true;

  return false;
}

function getWinnerIds(
  ordered: Player[],
  totals: Map<string, number>,
  template: GameTemplate,
  game: Game,
): Set<string> {
  if (ordered.length === 0) return new Set();

  if (template.winCondition === 'FirstToTarget') {
    const target = game.targetScore ?? template.defaultTargetScore ?? Number.MAX_SAFE_INTEGER;
    const reached = ordered.filter((p) => (totals.get(p.id) ?? 0) >= target);
    if (reached.length === 0) return new Set();
    const best = Math.max(...reached.map((p) => totals.get(p.id) ?? 0));
    return new Set(reached.filter((p) => (totals.get(p.id) ?? 0) === best).map((p) => p.id));
  }

  const winningTotal = totals.get(ordered[0].id) ?? 0;
  return new Set(ordered.filter((p) => (totals.get(p.id) ?? 0) === winningTotal).map((p) => p.id));
}

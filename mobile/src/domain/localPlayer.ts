import type { Game } from './models';

/** Match the saved display name to a player in the game (case-insensitive). */
export function findLocalPlayerId(game: Game, displayName: string): string | null {
  const needle = displayName.trim().toLowerCase();
  if (!needle) return null;
  return (
    game.players.find((p) => p.name.trim().toLowerCase() === needle)?.id ?? null
  );
}

/** Next round/hole number for a single player (independent of others). */
export function nextRoundForPlayer(game: Game, playerId: string): number {
  const max = game.events
    .filter((e) => e.playerId === playerId)
    .map((e) => e.roundNumber ?? 0)
    .reduce((m, n) => Math.max(m, n), 0);
  return max + 1;
}

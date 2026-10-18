import { playModeOf, type Game } from './models';

/**
 * The seat this device may play.
 * A bound seat matches its Firebase uid. An older seat with no uid still matches the display name.
 * A name match never takes a seat that is already bound to a different device.
 */
export function findLocalPlayerId(game: Game, displayName: string, uid?: string | null): string | null {
  if (uid) {
    const byUid = game.players.find((player) => player.uid === uid);
    if (byUid) return byUid.id;
  }
  const needle = displayName.trim().toLowerCase();
  if (!needle) return null;
  const byName = game.players.find((player) => player.name.trim().toLowerCase() === needle);
  if (!byName) return null;
  if (byName.uid && byName.uid !== uid) return null;
  return byName.id;
}

/**
 * Pass-and-play shares one device, so anyone seated there may take the turn.
 * On separate devices, only the player this device joined as may act.
 */
export function deviceMayAct(
  game: Pick<Game, 'playMode'>,
  localPlayerId: string | null,
  actorId: string | null | undefined,
): boolean {
  if (playModeOf(game) === 'pass-and-play') return true;
  return localPlayerId != null && actorId != null && localPlayerId === actorId;
}

/** Next round/hole number for a single player (independent of others). */
export function nextRoundForPlayer(game: Game, playerId: string): number {
  const max = game.events
    .filter((e) => e.playerId === playerId)
    .map((e) => e.roundNumber ?? 0)
    .reduce((m, n) => Math.max(m, n), 0);
  return max + 1;
}

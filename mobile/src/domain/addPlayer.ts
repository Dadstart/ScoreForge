import { createPlayer, type Game } from './models';

/** Add a named player to a game, enforcing uniqueness and max capacity. */
export function withAddedPlayer(game: Game, rawName: string, maxPlayers: number): Game {
  const name = rawName.trim();
  if (!name) {
    throw new Error('Enter a player name.');
  }
  if (game.players.length >= maxPlayers) {
    throw new Error(`This game already has the maximum of ${maxPlayers} players.`);
  }
  const taken = game.players.some(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new Error('A player with that name is already in the game.');
  }
  return {
    ...game,
    players: [...game.players, createPlayer(name)],
    updatedAt: new Date().toISOString(),
  };
}

/** Remove a player and any cash events recorded for them. */
export function withoutPlayer(game: Game, playerId: string): Game {
  if (game.players.length <= 1) {
    throw new Error('A game needs at least one player.');
  }
  if (!game.players.some((player) => player.id === playerId)) {
    throw new Error('That player is not in this game.');
  }
  const tokenSpaces = { ...(game.tokenSpaces ?? {}) };
  delete tokenSpaces[playerId];
  return {
    ...game,
    players: game.players.filter((player) => player.id !== playerId),
    events: game.events.filter((event) => event.playerId !== playerId),
    tokenSpaces,
    updatedAt: new Date().toISOString(),
  };
}

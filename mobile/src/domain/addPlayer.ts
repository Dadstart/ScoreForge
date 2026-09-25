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

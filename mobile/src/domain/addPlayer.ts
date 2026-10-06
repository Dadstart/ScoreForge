import { ensureBackgammonState } from './backgammon';
import { ensureCheckersState } from './checkers';
import { ensureChineseState, playerCap } from './chineseCheckers';
import { createPlayer, type Game, type Player } from './models';
import { PLAYER_TOKENS } from './monopoly';
import { ensureSorryState } from './sorry';

/** Add a named player to a game, enforcing uniqueness and max capacity. */
export function withAddedPlayer(game: Game, rawName: string, maxPlayers: number): Game {
  const name = rawName.trim();
  if (!name) {
    throw new Error('Enter a player name.');
  }
  const cap = playerCap(game, maxPlayers);
  if (game.players.length >= cap) {
    throw new Error(`This game already has the maximum of ${cap} players.`);
  }
  const taken = game.players.some(
    (p) => p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (taken) {
    throw new Error('A player with that name is already in the game.');
  }
  return ensureChineseState(
    ensureCheckersState(
      ensureSorryState(
        ensureBackgammonState({
          ...game,
          players: [...game.players, seatedPlayer(game, name)],
          updatedAt: new Date().toISOString(),
        }),
      ),
    ),
  );
}

/** A new Monopoly player gets the first unused piece. Other games stay nameless of tokens. */
function seatedPlayer(game: Game, name: string): Player {
  const player = createPlayer(name);
  if (game.templateId !== 'monopoly') return player;
  const taken = new Set(game.players.map((entry) => entry.token).filter((token) => token));
  const free = PLAYER_TOKENS.find((token) => !taken.has(token.id));
  return free ? { ...player, token: free.id } : player;
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
  return ensureChineseState(
    ensureCheckersState(
      ensureSorryState(
        ensureBackgammonState({
          ...game,
          players: game.players.filter((player) => player.id !== playerId),
          events: game.events.filter((event) => event.playerId !== playerId),
          tokenSpaces,
          updatedAt: new Date().toISOString(),
        }),
      ),
    ),
  );
}

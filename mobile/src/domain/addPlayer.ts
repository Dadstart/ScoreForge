import { ensureBackgammonState } from './backgammon';
import { ensureCheckersState } from './checkers';
import { ensureChineseState, playerCap } from './chineseCheckers';
import { createPlayer, type Game, type Player } from './models';
import { PLAYER_TOKENS, playerLabel, playerToken, singleEmoji } from './monopoly';
import { withoutMonopolyPlayer } from './monopolyPlay';
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
          players: [...game.players, seatedPlayer(game.templateId, game.players, name)],
          updatedAt: new Date().toISOString(),
        }),
      ),
    ),
  );
}

export type MonopolySeat = { name: string; token: string; emojiText: string };

/** Players typed on the Monopoly setup screen, each with their own piece. */
export function playersFromMonopolySeats(
  seats: MonopolySeat[],
  maxPlayers: number,
): { players: Player[] } | { error: string } {
  if (seats.length < 1) return { error: 'Add at least one player.' };
  if (seats.length > maxPlayers) return { error: `Monopoly allows up to ${maxPlayers} players.` };
  const names = seats.map((seat) => seat.name.trim());
  if (names.some((name) => !name)) return { error: 'Enter a name for each player.' };
  const folded = names.map((name) => name.toLowerCase());
  if (new Set(folded).size !== folded.length) return { error: 'Each player needs a different name.' };

  const players: Player[] = [];
  const marks = new Set<string>();
  for (let i = 0; i < seats.length; i += 1) {
    const seat = seats[i];
    const name = names[i];
    const typed = seat.emojiText.trim();
    const typedEmoji = typed ? singleEmoji(typed) : null;
    if (typed && !typedEmoji) return { error: `Enter one emoji for ${name}.` };
    const token = playerToken(typedEmoji ?? seat.token)?.id ?? null;
    const mark = playerToken(token)?.emoji ?? null;
    if (mark && marks.has(mark)) return { error: `${playerLabel(name, token)} needs a different piece.` };
    if (mark) marks.add(mark);
    players.push({ ...createPlayer(name), token });
  }
  return { players };
}

/** The next classic piece nobody at the table has taken. */
export function nextMonopolyToken(used: Array<string | null | undefined>): string {
  const taken = new Set(
    used.map((token) => playerToken(token)?.emoji).filter((emoji): emoji is string => Boolean(emoji)),
  );
  return PLAYER_TOKENS.find((token) => !taken.has(token.emoji))?.id ?? PLAYER_TOKENS[0].id;
}

/** The player who starts a game. A Monopoly host takes the first piece. */
export function openingPlayer(templateId: string, name: string): Player {
  return seatedPlayer(templateId, [], name);
}

/** A new Monopoly player gets the first unused piece. Other games stay nameless of tokens. */
function seatedPlayer(templateId: string, existing: Player[], name: string): Player {
  const player = createPlayer(name);
  if (templateId !== 'monopoly') return player;
  const taken = new Set(
    existing.map((entry) => playerToken(entry.token)?.emoji).filter((emoji) => emoji),
  );
  const free = PLAYER_TOKENS.find((token) => !taken.has(token.emoji));
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
  const remaining = game.players.filter((player) => player.id !== playerId);
  const monopoly = game.monopoly ? withoutMonopolyPlayer(game.monopoly, playerId, game.players) : game.monopoly;
  return ensureChineseState(
    ensureCheckersState(
      ensureSorryState(
        ensureBackgammonState({
          ...game,
          players: remaining,
          events: game.events.filter((event) => event.playerId !== playerId),
          tokenSpaces,
          monopoly,
          updatedAt: new Date().toISOString(),
        }),
      ),
    ),
  );
}

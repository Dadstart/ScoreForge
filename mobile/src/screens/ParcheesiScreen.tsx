import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { GameBanner, GameError, GameHeader } from '../components/GameChrome';
import { ParcheesiBoard } from '../components/ParcheesiBoard';
import { Button, Screen } from '../components/ui';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import {
  PARCHEESI_COLORS,
  colorIndexFor,
  createParcheesiState,
  ensureParcheesiState,
  homeCount,
  legalMoves,
  passTurn,
  playMove,
  rollDice,
  type ParcheesiMove,
  type ParcheesiState,
} from '../domain/parcheesi';
import { useLiveGame } from '../hooks/useLiveGame';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Parcheesi'>;

export function ParcheesiScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    commit,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
  } = useLiveGame(route.params.gameId, {
    repair: ensureParcheesiState,
    repairError: 'Could not set up the board',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const board = game?.parcheesi ?? null;
  const turnKey = `${board?.currentPlayerId ?? ''}:${board?.dice?.join('-') ?? ''}:${board?.remaining.join(',') ?? ''}:${board?.bonus?.kind ?? ''}`;

  useEffect(() => {
    setSelected(null);
  }, [turnKey]);

  const moves = useMemo(
    () => (board && game ? legalMoves(board, game.players) : []),
    [board, game],
  );
  const deadRoll = board?.dice && !board.winnerId ? `${board.currentPlayerId}:${board.dice.join(',')}` : '';

  useEffect(() => {
    if (!deadRoll || !game || !board?.dice || board.winnerId || moves.length > 0) return;
    commit((currentGame) => {
      const live = currentGame.parcheesi;
      if (!live) return null;
      const next = passTurn(live, currentGame.players);
      if (!next) return null;
      setError(null);
      return stamp(currentGame, next);
    });
  }, [deadRoll, moves.length]);

  if (!game || !template || !snapshot || !board) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const passAndPlay = playModeOf(game) === 'pass-and-play';
  const finished = Boolean(board.winnerId);
  const current = game.players.find((player) => player.id === board.currentPlayerId) ?? null;
  const canAct = !finished && deviceMayAct(game, localPlayerId, board.currentPlayerId);
  const canRoll = canAct && !board.dice;
  const onRoll = () => apply((live) => rollDice(live, game.players));
  const selectable = new Set(moves.map((move) => move.pawn));

  const apply = (build: (currentBoard: ParcheesiState) => ParcheesiState | null) => {
    setConfirmReset(false);
    commit((currentGame) => {
      const live = currentGame.parcheesi;
      if (!live) return null;
      const next = build(live);
      if (!next) return null;
      setError(null);
      return stamp(currentGame, next);
    }, (next) => Boolean(next.parcheesi?.winnerId) && !board.winnerId);
  };

  const onMove = (move: ParcheesiMove) => {
    if (!canAct) return;
    apply((live) => playMove(live, game.players, move));
  };

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <GameHeader
          name={game.name}
          badge="Parcheesi"
          templateId="parcheesi"
          shareCode={game.shareCode}
          passAndPlay={passAndPlay}
          onHome={() => navigation.navigate('Home')}
        />
        <GameBanner title={bannerText(board, current?.name ?? 'Player', localPlayerId === board.currentPlayerId, moves.length)}>
          {board.lastAction ? <Text style={styles.action}>{board.lastAction}</Text> : null}
        </GameBanner>
        <GameError message={error} />

        <View style={styles.diceRow}>
          {board.dice ? (
            board.dice.map((face, index) => (
              <Die key={`${face}-${index}`} face={face} used={dieUsed(board.dice ?? [], board.remaining)[index] === true} />
            ))
          ) : (
            <Text style={styles.waiting}>{finished ? 'The race is over.' : 'Dice are waiting.'}</Text>
          )}
        </View>

        {canRoll ? (
          <Button label={board.doublesStreak > 0 ? 'Roll again' : 'Roll'} variant="primary" onPress={onRoll} />
        ) : null}
        {canAct && board.dice && moves.length === 0 ? (
          <Button label="Can't move" variant="secondary" onPress={() => apply((live) => passTurn(live, game.players))} />
        ) : null}

        <ParcheesiBoard
          state={board}
          moves={moves}
          selected={selected != null && selectable.has(selected) ? selected : null}
          canAct={canAct}
          canRoll={canRoll}
          onRoll={onRoll}
          onSelect={(pawn) => setSelected(pawn != null && selectable.has(pawn) ? pawn : null)}
          onMove={onMove}
        />

        <View style={styles.players}>
          {game.players.map((player) => {
            const swatch = PARCHEESI_COLORS[colorIndexFor(board, player.id)];
            const home = homeCount(board, player.id);
            const turn = player.id === board.currentPlayerId && !finished;
            return (
              <View key={player.id} style={styles.player}>
                <View style={[styles.dot, { backgroundColor: swatch.fill }]} />
                <Text style={[styles.playerText, turn && styles.turn]}>
                  {player.name}
                  {player.id === localPlayerId ? ' · you' : ''} · {swatch.name} · {home} home
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Button
            label={confirmReset ? 'Confirm new game' : 'New game'}
            onPress={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              setConfirmReset(false);
              beginSuppress();
              commit((currentGame) => stamp(currentGame, createParcheesiState(currentGame.players)), false);
              endSuppress(false);
            }}
          />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
        </View>
      </View>

      {showCelebration ? (
        <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Parcheesi" onDismiss={dismissCelebration} />
      ) : null}
      <AddPlayerModal
        visible={addingPlayer}
        maxPlayers={template.maxPlayers}
        currentCount={game.players.length}
        onCancel={() => setAddingPlayer(false)}
        onAdd={async (name) => {
          const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
          setGame((currentGame) => preferNewerGame(currentGame, saved));
          setAddingPlayer(false);
        }}
      />
    </Screen>
  );
}

function stamp(game: Game, board: ParcheesiState): Game {
  return {
    ...game,
    parcheesi: board,
    status: board.winnerId ? 'Completed' : 'InProgress',
    updatedAt: new Date().toISOString(),
  };
}

function bannerText(board: ParcheesiState, name: string, yourTurn: boolean, moveCount: number): string {
  if (board.winnerId) return `${name} got every pawn home.`;
  const who = yourTurn ? 'You' : name;
  if (!board.dice) return board.doublesStreak > 0 ? `${who} rolled doubles. Roll again.` : `${who} roll${yourTurn ? '' : 's'}.`;
  if (board.bonus?.kind === 'capture') return `${who} captured a pawn. Move it 20.`;
  if (board.bonus?.kind === 'home') return `${who} reached the center. Move another pawn 10.`;
  if (moveCount === 0) return `${who} cannot use this roll. The turn passes.`;
  return `${who} play${yourTurn ? '' : 's'} ${board.dice[0]} and ${board.dice[1]}.`;
}

function dieUsed(dice: number[], remaining: number[]): boolean[] {
  const pool = [...remaining];
  return dice.map((face) => {
    const at = pool.indexOf(face);
    if (at < 0) return true;
    pool.splice(at, 1);
    return false;
  });
}

function Die({ face, used }: { face: number; used: boolean }) {
  return (
    <View style={[styles.die, used && styles.dieUsed]} accessibilityLabel={`Die showing ${face}`}>
      <Text style={[styles.dieText, used && styles.dieTextUsed]}>{face}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  action: { color: colors.muted, fontSize: 14 },
  diceRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', minHeight: 48 },
  waiting: { color: colors.muted, fontSize: 15 },
  die: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dieUsed: { borderColor: colors.border, opacity: 0.45 },
  dieText: { color: colors.accent, fontSize: 22, fontWeight: '800' },
  dieTextUsed: { color: colors.muted },
  players: { gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  playerText: { color: colors.text, fontSize: 15 },
  turn: { color: colors.accent, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

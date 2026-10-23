import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { DangerBoard } from '../components/DangerBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { GameBanner, GameError, GameHeader } from '../components/GameChrome';
import { Button, Screen } from '../components/ui';
import {
  DANGER_COLORS,
  colorIndexFor,
  createDangerState,
  ensureDangerState,
  homeCount,
  legalMoves,
  passTurn,
  playMove,
  rollDie,
  type DangerMove,
  type DangerState,
} from '../domain/danger';
import { playDiceRoll, prepareDiceRoll } from '../audio/diceRollSound';
import { reducedMotion } from '../components/cardMotion';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import { useLiveGame } from '../hooks/useLiveGame';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { getSettings } from '../storage/settingsStore';
import { colors, space } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Danger'>;

const FACE_HOLD_MS = 2500;

export function DangerScreen({ navigation, route }: Props) {
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
    repair: ensureDangerState,
    repairError: 'Could not set up the board',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const board = game?.danger ?? null;

  useEffect(() => {
    prepareDiceRoll();
  }, []);
  const turnKey = `${board?.currentPlayerId ?? ''}:${board?.die ?? ''}:${board?.again ? 'again' : ''}`;

  useEffect(() => {
    setSelected(null);
  }, [turnKey]);

  const moves = useMemo(
    () => (board && game ? legalMoves(board, game.players) : []),
    [board, game],
  );
  const deadRoll = board?.die != null && !board.winnerId ? `${board.currentPlayerId}:${board.die}` : '';
  const dieNow = board?.die ?? null;
  const seenFace = useRef<number | null>(dieNow);
  const [heldFace, setHeldFace] = useState<number | null>(null);
  if (dieNow != null) {
    seenFace.current = dieNow;
    if (heldFace != null) setHeldFace(null);
  } else if (seenFace.current != null && heldFace !== seenFace.current) {
    setHeldFace(seenFace.current);
  }

  useEffect(() => {
    if (heldFace == null || board?.winnerId || board?.die != null) return;
    const timer = setTimeout(() => {
      seenFace.current = null;
      setHeldFace(null);
    }, FACE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [heldFace, board?.die, board?.winnerId]);

  useEffect(() => {
    if (!deadRoll || !game || board?.die == null || board.winnerId || moves.length > 0) return;
    const timer = setTimeout(() => {
      commit((currentGame) => {
        const live = currentGame.danger;
        if (!live?.die) return null;
        const next = passTurn(live, currentGame.players);
        if (!next) return null;
        setError(null);
        return stamp(currentGame, next);
      });
    }, reducedMotion() ? 0 : 1200);
    return () => clearTimeout(timer);
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
  const canRoll = canAct && board.die == null;
  const onRoll = () => {
    playDiceRoll();
    if (getSettings().haptics) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    }
    apply((live) => rollDie(live, game.players));
  };
  const selectable = new Set(moves.map((move) => move.peg));

  const apply = (build: (currentBoard: DangerState) => DangerState | null) => {
    setConfirmReset(false);
    commit((currentGame) => {
      const live = currentGame.danger;
      if (!live) return null;
      const next = build(live);
      if (!next) return null;
      setError(null);
      return stamp(currentGame, next);
    }, (next) => Boolean(next.danger?.winnerId) && !board.winnerId);
  };

  const onMove = (move: DangerMove) => {
    if (!canAct) return;
    apply((live) => playMove(live, game.players, move));
  };

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <GameHeader
          name={game.name}
          badge="Danger"
          templateId="danger"
          shareCode={game.shareCode}
          passAndPlay={passAndPlay}
          onHome={() => navigation.navigate('Home')}
        />
        <GameBanner title={bannerText(board, current?.name ?? 'Player', localPlayerId === board.currentPlayerId, moves.length)}>
          {board.lastAction ? <Text style={styles.action}>{board.lastAction}</Text> : null}
        </GameBanner>
        <GameError message={error} />

        {canRoll && heldFace == null ? (
          <Button label={board.again ? 'Roll again' : 'Roll'} variant="primary" onPress={onRoll} />
        ) : null}
        {canAct && board.die != null && moves.length === 0 ? (
          <Button label="Can't move" variant="secondary" onPress={() => apply((live) => passTurn(live, game.players))} />
        ) : null}

        <DangerBoard
          state={board}
          moves={moves}
          selected={selected != null && selectable.has(selected) ? selected : null}
          canAct={canAct}
          canRoll={canRoll && heldFace == null}
          heldFace={heldFace}
          onRoll={onRoll}
          onSelect={(peg) => setSelected(peg != null && selectable.has(peg) ? peg : null)}
          onMove={onMove}
        />

        <View style={styles.players}>
          {game.players.map((player) => {
            const swatch = DANGER_COLORS[colorIndexFor(board, player.id)];
            const home = homeCount(board, player.id);
            const turn = player.id === board.currentPlayerId && !finished;
            return (
              <View key={player.id} style={styles.player}>
                <View style={[styles.dot, { backgroundColor: swatch.fill }]} />
                <Text style={[styles.playerText, turn && styles.turn]}>
                  {player.name}
                  {player.id === localPlayerId ? ' · you' : ''} · {swatch.name} · {home} finished
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
              commit((currentGame) => stamp(currentGame, createDangerState(currentGame.players)), false);
              endSuppress(false);
            }}
          />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
        </View>
      </View>

      {showCelebration ? (
        <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Danger" onDismiss={dismissCelebration} />
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

function stamp(game: Game, board: DangerState): Game {
  return {
    ...game,
    danger: board,
    status: board.winnerId ? 'Completed' : 'InProgress',
    updatedAt: new Date().toISOString(),
  };
}

function bannerText(board: DangerState, name: string, yourTurn: boolean, moveCount: number): string {
  if (board.winnerId) return `${name} finished every peg.`;
  const who = yourTurn ? 'You' : name;
  if (board.die == null) return board.again ? `${who} rolled a 6. Roll again.` : `${who} roll${yourTurn ? '' : 's'}.`;
  if (moveCount === 0) return `${who} cannot use this roll. The turn passes.`;
  return `${who} play${yourTurn ? '' : 's'} ${board.die}.`;
}

const styles = StyleSheet.create({
  screen: { gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  action: { color: colors.muted, fontSize: 14 },
  players: { gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  playerText: { color: colors.text, fontSize: 15 },
  turn: { color: colors.accent, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

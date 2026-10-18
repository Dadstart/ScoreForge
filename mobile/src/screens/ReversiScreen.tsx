import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { PlaySpark } from '../components/PlaySpark';
import { ReversiBoard } from '../components/ReversiBoard';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import {
  REVERSI_SIDES,
  answerDraw,
  countDiscs,
  createReversiState,
  ensureReversiState,
  legalMoves,
  offerDraw,
  playMove,
  resign,
  type ReversiState,
} from '../domain/reversi';
import { calculate } from '../domain/scoreCalculator';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Reversi'>;

export function ReversiScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    saving,
    persist,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(route.params.gameId, {
    repair: ensureReversiState,
    repairError: 'Could not set up the board',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const { sparks, spark } = usePlaySpark();

  const reversi = game?.reversi ?? null;
  const priorReversi = useRef<ReversiState | null>(null);
  useEffect(() => {
    const prior = priorReversi.current;
    priorReversi.current = reversi;
    if (!prior || !reversi || !reversi.lastMove) return;
    const sameMove = prior.lastMove?.row === reversi.lastMove.row && prior.lastMove?.col === reversi.lastMove.col;
    if (sameMove) return;
    const flips = reversi.lastFlips.length;
    if (flips > 0) spark(flips === 1 ? 'Flip!' : `${flips} flips`, 'gold');
  }, [reversi, spark]);

  const moveKey = reversi?.lastMove ? `${reversi.lastMove.row},${reversi.lastMove.col}` : '';
  useEffect(() => {
    setConfirmReset(false);
    setConfirmResign(false);
  }, [reversi?.turn, moveKey, reversi?.winnerSide, reversi?.draw]);

  const moves = useMemo(() => (reversi ? legalMoves(reversi) : []), [reversi]);

  if (!game || !template || !snapshot || !reversi) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const finished = Boolean(reversi.winnerSide || reversi.draw || snapshot.isComplete);
  const currentSide = REVERSI_SIDES[reversi.turn];
  const currentPlayer = game.players.find((player) => reversi.sides[player.id] === reversi.turn) ?? null;
  const yourTurn = currentPlayer?.id === localPlayerId;
  const canAct = !finished && deviceMayAct(game, localPlayerId, currentPlayer?.id ?? null);
  const drawResponderId = reversi.drawOffer
    ? (game.players.find(
        (player) => reversi.sides[player.id] === (reversi.drawOffer === 'dark' ? 'light' : 'dark'),
      )?.id ?? null)
    : null;
  const canAnswerDraw = deviceMayAct(game, localPlayerId, drawResponderId);
  const winnerSide = reversi.winnerSide ? REVERSI_SIDES[reversi.winnerSide] : null;
  const winnerPlayer = reversi.winnerSide
    ? game.players.find((player) => reversi.sides[player.id] === reversi.winnerSide)
    : null;
  const darkCount = countDiscs(reversi.cells, 'dark');
  const lightCount = countDiscs(reversi.cells, 'light');
  const actor = yourTurn ? 'Your turn' : currentPlayer ? `${currentPlayer.name}'s turn` : null;
  const turnLine = actor ? `${actor} · ${currentSide.name}` : `${currentSide.name}'s turn`;
  const banner = reversi.draw
    ? 'Draw'
    : winnerSide
      ? `${winnerPlayer?.name ?? winnerSide.name} wins`
      : turnLine;
  const agreedDraw = reversi.draw && reversi.lastAction === 'The game is a draw.';

  const apply = async (nextReversi: ReversiState) => {
    const next: Game = {
      ...game,
      reversi: nextReversi,
      status: nextReversi.winnerSide || nextReversi.draw ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onSquare = (row: number, col: number) => {
    if (!canAct || saving.current) return;
    const next = playMove(reversi, game.players, row, col);
    if (!next) return;
    void apply(next);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      reversi: createReversiState(game.players),
      events: [],
      status: 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    beginSuppress();
    setConfirmReset(false);
    try {
      noteLocalResult(calculate(next, template));
      await persist(next, false);
    } finally {
      endSuppress(false);
    }
  };

  const onResign = async () => {
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }
    const next = resign(reversi, game.players);
    setConfirmResign(false);
    if (next) await apply(next);
  };

  const applyResult = async (nextReversi: ReversiState | null) => {
    if (!nextReversi) return;
    await apply(nextReversi);
  };

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Reversi" tone="accent" />
          </View>
          <GameHelp templateId="reversi" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={playModeOf(game) === 'pass-and-play'} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          <Text style={styles.scoreLine}>
            Black {darkCount} · White {lightCount}
          </Text>
          {reversi.lastAction ? <Text style={styles.action}>{reversi.lastAction}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <ReversiBoard
              cells={reversi.cells}
              moves={canAct ? moves : []}
              turn={reversi.turn}
              lastMove={reversi.lastMove}
              lastFlips={reversi.lastFlips}
              disabled={!canAct}
              onSquare={onSquare}
            />
            <Text style={styles.hint}>
              Tap a dotted square. A disc has to bracket a line, and those discs flip. A side with no move is skipped.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.playerRow}>
              {game.players.map((player) => {
                const sideId = reversi.sides[player.id];
                const side = sideId ? REVERSI_SIDES[sideId] : null;
                const count = sideId ? countDiscs(reversi.cells, sideId) : 0;
                const active = sideId === reversi.turn && !finished;
                return (
                  <View key={player.id} style={[styles.playerChip, active && styles.playerChipActive]}>
                    <View style={[styles.dot, { backgroundColor: side?.fill ?? colors.muted, borderColor: side?.rim }]} />
                    <Text style={typography.label}>
                      {player.name}
                      {player.id === localPlayerId ? ' · you' : ''}
                      {side ? ` · ${side.name}` : ''} · {count}
                    </Text>
                  </View>
                );
              })}
            </View>

            {finished ? (
              <Text style={typography.body}>
                {agreedDraw ? 'Both sides agreed to a draw.' : 'Reset the board to play again.'}
              </Text>
            ) : (
              <Text style={typography.body}>
                {playModeOf(game) === 'pass-and-play'
                  ? 'Pass the phone for the color whose turn it is.'
                  : game.players.length < 2
                    ? 'Share the code for White. Each phone moves only its own color.'
                    : 'Each phone moves only its own color.'}
              </Text>
            )}

            {!finished && (canAct || canAnswerDraw) ? (
              <View style={styles.actions}>
                {reversi.drawOffer && canAnswerDraw ? (
                  <>
                    <Button
                      label="Accept draw"
                      variant="primary"
                      onPress={() => void applyResult(answerDraw(reversi, game.players, true))}
                    />
                    <Button label="Decline" onPress={() => void applyResult(answerDraw(reversi, game.players, false))} />
                  </>
                ) : canAct ? (
                  <Button label="Offer draw" onPress={() => void applyResult(offerDraw(reversi, game.players))} />
                ) : null}
                {canAct ? (
                  <Button
                    label={confirmResign ? 'Confirm resign' : 'Resign'}
                    variant="danger"
                    onPress={() => void onResign()}
                  />
                ) : null}
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button label={confirmReset ? 'Confirm reset' : 'Reset board'} onPress={() => void onReset()} />
              {game.players.length < template.maxPlayers ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Reversi" onDismiss={dismissCelebration} />
        ) : null}

        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
            setGame((current) => preferNewerGame(current, saved));
            setError(null);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.md, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 12,
    borderRadius: radii.md,
    gap: 4,
  },
  bannerText: { ...typography.label, fontSize: 15 },
  scoreLine: { ...typography.label, color: colors.text },
  action: { ...typography.body, color: colors.text },
  wide: { flexDirection: 'row', gap: 16, paddingBottom: 24, alignItems: 'flex-start' },
  stack: { gap: 12, paddingBottom: 28 },
  boardPane: { gap: 8, width: '100%' },
  boardPaneWide: { flex: 1.2, minWidth: 360 },
  hint: { ...typography.body, fontSize: 13 },
  panel: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 10,
  },
  section: { marginTop: 4 },
  playerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playerChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.borderStrong },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

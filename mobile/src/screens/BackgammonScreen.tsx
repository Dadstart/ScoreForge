import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { BackgammonBoard } from '../components/BackgammonBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import {
  BACKGAMMON_SIDES,
  answerDouble,
  createBackgammonState,
  endTurn,
  ensureBackgammonState,
  legalMoves,
  offerDouble,
  pipCount,
  playMove,
  resign,
  rollDice,
  stake,
  undoMove,
  type BackgammonState,
  type Side,
} from '../domain/backgammon';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { usePlaySpark } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Backgammon'>;
type Selection = number | 'bar';

export function BackgammonScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const saving = useRef(false);
  const { showCelebration, onSnapshot, dismissCelebration, beginSuppress, endSuppress, noteLocalResult } =
    useWinCelebration();
  const { sparks, spark } = usePlaySpark();

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame((current) => (found ? preferNewerGame(current, found) : null));
        if (found) {
          const tmpl = getTemplate(found.templateId);
          if (tmpl) onSnapshot(calculate(found, tmpl));
        }
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId, onSnapshot]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(() => (game && template ? calculate(game, template) : null), [game, template]);
  const localPlayerId = useMemo(() => (game ? findLocalPlayerId(game, displayName) : null), [game, displayName]);

  useEffect(() => {
    if (!game) return;
    const next = ensureBackgammonState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not set up the board');
      });
  }, [game]);

  const board = game?.backgammon ?? null;
  const priorBoard = useRef<BackgammonState | null>(null);
  useEffect(() => {
    const prior = priorBoard.current;
    priorBoard.current = board;
    if (!prior || !board) return;
    const borne = board.off.light + board.off.dark - (prior.off.light + prior.off.dark);
    const hits = board.bar.light + board.bar.dark - (prior.bar.light + prior.bar.dark);
    if (borne > 0) spark(borne > 1 ? `${borne} off` : 'Off!', 'green');
    else if (hits > 0) spark(hits > 1 ? `${hits} hits` : 'Hit!', 'rose');
  }, [board, spark]);
  const turnKey = board?.turn ?? null;
  const diceKey = board?.dice?.join('-') ?? '';
  const remainingKey = board?.remaining.join('-') ?? '';
  useEffect(() => {
    setSelection(null);
    setConfirmReset(false);
    setConfirmResign(false);
  }, [turnKey, diceKey, remainingKey, board?.winnerSide, board?.offer]);

  const moves = useMemo(() => (board ? legalMoves(board) : []), [board]);
  const origins = useMemo(() => {
    const seen = new Set<Selection>();
    const list: Selection[] = [];
    for (const move of moves) {
      if (seen.has(move.from)) continue;
      seen.add(move.from);
      list.push(move.from);
    }
    return list;
  }, [moves]);
  const selected = selection ?? (origins.length === 1 ? origins[0] : null);

  const persist = async (next: Game, celebrate: boolean) => {
    if (!template || saving.current) return;
    saving.current = true;
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      const saved = await saveGame(next);
      setGame((current) => preferNewerGame(current, saved));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

  if (!game || !template || !snapshot || !board) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const finished = Boolean(board.winnerSide || snapshot.isComplete);
  const currentSide = BACKGAMMON_SIDES[board.turn];
  const currentPlayer = game.players.find((player) => board.sides[player.id] === board.turn) ?? null;
  const yourTurn = currentPlayer?.id === localPlayerId;
  const localSide = localPlayerId ? board.sides[localPlayerId] : undefined;
  const winnerSide = board.winnerSide ? BACKGAMMON_SIDES[board.winnerSide] : null;
  const winnerPlayer = board.winnerSide
    ? game.players.find((player) => board.sides[player.id] === board.winnerSide)
    : null;
  const actor = yourTurn ? 'Your turn' : currentPlayer ? `${currentPlayer.name}'s turn` : null;
  const turnLine = actor ? `${actor} · ${currentSide.name}` : `${currentSide.name} to play`;
  const kind = board.winKind === 3 ? ' a backgammon' : board.winKind === 2 ? ' a gammon' : '';
  const banner = winnerSide
    ? `${winnerPlayer?.name ?? winnerSide.name} wins${kind} · ${stake(board)} points`
    : board.offer
      ? `${game.players.find((player) => board.sides[player.id] === board.offer)?.name ?? 'The doubler'} doubles to ${board.cube * 2}`
      : `${turnLine}${board.bar[board.turn] > 0 && board.dice ? ' · enter from the bar' : ''}`;
  const canDouble =
    !finished && !board.dice && !board.offer && board.undo.length === 0 && board.cube < 64 && (!board.cubeOwner || board.cubeOwner === board.turn);

  const apply = async (nextBoard: BackgammonState | null) => {
    if (!nextBoard) return;
    const next: Game = {
      ...game,
      backgammon: nextBoard,
      status: nextBoard.winnerSide ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const play = (from: Selection, to: number | 'off') => {
    if (finished || saving.current) return;
    void apply(playMove(board, game.players, { from, to }));
  };

  const onPoint = (point: number) => {
    if (finished || saving.current) return;
    if (selected != null && moves.some((move) => move.from === selected && move.to === point)) {
      play(selected, point);
      return;
    }
    if (moves.some((move) => move.from === point)) {
      setSelection(point);
      return;
    }
    setSelection(null);
  };

  const onBar = () => {
    if (finished || saving.current) return;
    if (moves.some((move) => move.from === 'bar')) setSelection('bar');
  };

  const onBearOff = () => {
    if (selected == null) return;
    if (moves.some((move) => move.from === selected && move.to === 'off')) play(selected, 'off');
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      backgammon: createBackgammonState(game.players),
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

  return (
    <Screen>
      <View
        style={[
          styles.screen,
          { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Backgammon" tone="accent" />
          </View>
          <GameHelp templateId="backgammon" />
          <ShareCodePanel shareCode={game.shareCode} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {board.lastAction ? <Text style={styles.action}>{board.lastAction}</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <View style={styles.diceRow}>
              {board.dice ? (
                <>
                  <Die value={board.dice[0]} />
                  <Die value={board.dice[1]} />
                  <Text style={styles.diceNote}>
                    {board.dice[0] === board.dice[1] ? 'Double' : 'Dice'}
                    {board.remaining.length > 0 ? ` · ${board.remaining.length} to play` : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.diceNote}>{finished ? 'Game over' : 'Roll to move'}</Text>
              )}
            </View>
            <BackgammonBoard
              state={board}
              moves={finished || board.offer ? [] : moves}
              selected={selected}
              flip={localSide === 'dark'}
              disabled={finished || Boolean(board.offer)}
              onPoint={onPoint}
              onBar={onBar}
              onBearOff={onBearOff}
            />
            <Text style={styles.hint}>
              White moves toward 1. Black moves toward 24. Bear off through the tray beside your home. A single checker
              can be hit to the bar. Tap a checker, then a highlighted point. Offer the cube before you roll.
              {localSide ? ` Your ${BACKGAMMON_SIDES[localSide].name} checkers sit at the bottom.` : ''}
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={[typography.section, styles.section]}>Turn</Text>
            <View style={styles.actions}>
              {!finished && !board.dice && !board.offer ? (
                <Button label="Roll" variant="primary" onPress={() => void apply(rollDice(board, game.players))} />
              ) : null}
              {canDouble ? (
                <Button label={`Double to ${board.cube * 2}`} onPress={() => void apply(offerDouble(board, game.players))} />
              ) : null}
              {board.offer && !finished ? (
                <>
                  <Button label="Take" variant="primary" onPress={() => void apply(answerDouble(board, game.players, true))} />
                  <Button label="Drop" variant="danger" onPress={() => void apply(answerDouble(board, game.players, false))} />
                </>
              ) : null}
              {!finished && board.dice && moves.length === 0 ? (
                <Button label="No legal move" variant="primary" onPress={() => void apply(endTurn(board, game.players))} />
              ) : null}
              {!finished && board.undo.length > 0 ? (
                <Button label="Undo" onPress={() => void apply(undoMove(board, game.players))} />
              ) : null}
            </View>

            <Text style={[typography.section, styles.section]}>Players</Text>
            {game.players.map((player) => {
              const side = board.sides[player.id];
              if (side !== 'light' && side !== 'dark') return null;
              const color = BACKGAMMON_SIDES[side];
              const active = side === board.turn && !finished;
              const holdsCube = board.cubeOwner === side;
              return (
                <View key={player.id} style={[styles.playerChip, active && styles.playerChipActive]}>
                  <View style={[styles.dot, { backgroundColor: color.fill, borderColor: color.rim }]} />
                  <Text style={typography.body}>
                    {player.name}
                    {player.id === localPlayerId ? ' · you' : ''} · {pipCount(board, side)} pips · {board.off[side]} off
                    {holdsCube ? ' · cube' : ''}
                  </Text>
                </View>
              );
            })}

            <Text style={styles.hint}>
              {finished
                ? 'Reset the board to play again.'
                : `Cube is ${board.cube}${board.cubeOwner ? `, held by ${ownerName(board, game, board.cubeOwner)}` : ', in the middle'}.`}
            </Text>
            <View style={styles.actions}>
              <Button label={confirmReset ? 'Reset board?' : 'Reset board'} variant="danger" onPress={() => void onReset()} />
              {!finished ? (
                <Button
                  label={confirmResign ? 'Resign?' : 'Resign'}
                  onPress={() => {
                    if (!confirmResign) {
                      setConfirmResign(true);
                      return;
                    }
                    setConfirmResign(false);
                    void apply(resign(board, game.players));
                  }}
                />
              ) : null}
              {game.players.length < template.maxPlayers ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
          </View>
        </View>
        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Backgammon" onDismiss={dismissCelebration} />
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

function ownerName(board: BackgammonState, game: Game, side: Side): string {
  return game.players.find((player) => board.sides[player.id] === side)?.name ?? BACKGAMMON_SIDES[side].name;
}

function Die({ value }: { value: number }) {
  return (
    <View style={styles.die}>
      <Text style={styles.dieText}>{value}</Text>
    </View>
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
  action: { ...typography.body, color: colors.text },
  wide: { flexDirection: 'row', gap: 16, paddingBottom: 24, alignItems: 'flex-start' },
  stack: { gap: 12, paddingBottom: 28 },
  boardPane: { gap: 8, width: '100%' },
  boardPaneWide: { flex: 1.2, minWidth: 360 },
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  die: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f7f1e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dieText: { color: '#2a2118', fontSize: 18, fontWeight: '700' },
  diceNote: { ...typography.body, color: colors.textDim },
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
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

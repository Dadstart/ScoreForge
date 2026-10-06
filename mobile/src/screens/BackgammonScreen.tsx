import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
  type BackgammonMove,
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
              <DicePair dice={board.dice} finished={finished} />
              {board.dice ? (
                <Text style={styles.diceNote}>
                  {board.dice[0] === board.dice[1] ? 'Doubles' : 'Dice'}
                  {board.remaining.length > 0 ? ` · ${board.remaining.length} to play` : ''}
                </Text>
              ) : null}
            </View>
            <MoveHints
              board={board}
              moves={finished || board.offer ? [] : moves}
              selected={selected}
              localSide={localSide}
              onSelect={setSelection}
              onPlay={play}
            />
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

function MoveHints({
  board,
  moves,
  selected,
  localSide,
  onSelect,
  onPlay,
}: {
  board: BackgammonState;
  moves: readonly BackgammonMove[];
  selected: Selection | null;
  localSide?: Side;
  onSelect: (origin: Selection) => void;
  onPlay: (from: Selection, to: number | 'off') => void;
}) {
  if (board.winnerSide) return null;
  if (board.offer) {
    return (
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>Doubling cube</Text>
        <Text style={styles.hintBody}>Take to play on, or drop to concede.</Text>
      </View>
    );
  }
  if (!board.dice) {
    return (
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>Roll to move</Text>
        <Text style={styles.hintBody}>
          Checkers you can move will light up, and each option shows its die.
          {localSide ? ` Your ${BACKGAMMON_SIDES[localSide].name} checkers sit at the bottom.` : ''}
        </Text>
      </View>
    );
  }
  if (moves.length === 0) {
    return (
      <View style={styles.hintCard}>
        <Text style={styles.hintTitle}>No legal move</Text>
        <Text style={styles.hintBody}>These dice cannot be played. Pass the turn.</Text>
      </View>
    );
  }

  const origins = uniqueOrigins(moves);
  const active = selected != null && moves.some((move) => move.from === selected) ? selected : null;
  const options = active == null ? [] : moves.filter((move) => move.from === active);
  const others = active == null ? [] : origins.filter((origin) => origin !== active);

  return (
    <View style={styles.hintCard}>
      <Text style={styles.hintTitle}>{active == null ? 'Choose a checker' : `Move from ${placeName(active)}`}</Text>
      <View style={styles.chipRow}>
        {active == null
          ? origins.map((origin) => (
              <Pressable
                key={String(origin)}
                accessibilityRole="button"
                accessibilityLabel={`Move the checker on ${placeName(origin)}`}
                onPress={() => onSelect(origin)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{placeName(origin)}</Text>
              </Pressable>
            ))
          : options.map((move) => (
              <Pressable
                key={`${move.from}-${move.to}-${move.die}`}
                accessibilityRole="button"
                accessibilityLabel={optionSentence(move)}
                onPress={() => onPlay(move.from, move.to)}
                style={[styles.chip, move.hit && styles.chipHit]}
              >
                <Text style={[styles.chipText, move.hit && styles.chipHitText]}>{optionLabel(move)}</Text>
              </Pressable>
            ))}
      </View>
      {others.length > 0 ? (
        <View style={styles.chipRow}>
          {others.map((origin) => (
            <Pressable
              key={String(origin)}
              accessibilityRole="button"
              accessibilityLabel={`Or move from ${placeName(origin)}`}
              onPress={() => onSelect(origin)}
              style={styles.chipQuiet}
            >
              <Text style={styles.chipQuietText}>{placeName(origin)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function uniqueOrigins(moves: readonly BackgammonMove[]): Selection[] {
  const seen = new Set<Selection>();
  const list: Selection[] = [];
  for (const move of moves) {
    if (seen.has(move.from)) continue;
    seen.add(move.from);
    list.push(move.from);
  }
  return list;
}

function placeName(place: Selection): string {
  return place === 'bar' ? 'Bar' : `Point ${place}`;
}

function optionLabel(move: BackgammonMove): string {
  const hit = move.hit ? ' · hit' : '';
  if (move.to === 'off') return `Bear off · ${move.die}`;
  if (move.from === 'bar') return `Enter ${move.to} · ${move.die}${hit}`;
  return `To ${move.to} · ${move.die}${hit}`;
}

function optionSentence(move: BackgammonMove): string {
  const die = `using ${move.die}`;
  const hit = move.hit ? ', hitting a blot' : '';
  if (move.to === 'off') return `Bear off from ${placeName(move.from)} ${die}`;
  if (move.from === 'bar') return `Enter on ${move.to} ${die}${hit}`;
  return `Move from ${move.from} to ${move.to} ${die}${hit}`;
}

const PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

function reducedMotion(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return nativeReduced;
}

function DicePair({ dice, finished }: { dice: readonly [number, number] | null; finished: boolean }) {
  const token = dice ? `${dice[0]}-${dice[1]}` : '';
  const [rolling, setRolling] = useState(false);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    const first = seen.current === null;
    seen.current = token;
    if (first || !token || reducedMotion()) {
      setRolling(false);
      return;
    }
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), 560);
    return () => clearTimeout(timer);
  }, [token]);

  if (!dice) {
    return <Text style={styles.diceNote}>{finished ? 'Game over' : 'Roll to move'}</Text>;
  }
  return (
    <>
      <PipDie face={dice[0]} rolling={rolling} delay={0} />
      <PipDie face={dice[1]} rolling={rolling} delay={80} />
    </>
  );
}

function PipDie({ face, rolling, delay }: { face: number; rolling: boolean; delay: number }) {
  const [shown, setShown] = useState(face);
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!rolling) {
      setShown(face);
      motion.setValue(0);
      return;
    }
    let step = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const starter = setTimeout(() => {
      interval = setInterval(() => {
        step += 1;
        if (step >= 5) {
          if (interval) clearInterval(interval);
          setShown(face);
          return;
        }
        const next = ((face + step - 1) % 6) + 1;
        setShown(next === face ? (next % 6) + 1 : next);
      }, 70);
    }, delay);
    motion.setValue(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 420,
      delay,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => {
      clearTimeout(starter);
      if (interval) clearInterval(interval);
      animation.stop();
    };
  }, [rolling, face, delay, motion]);

  const lift = motion.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -8, 0] });
  const rock = motion.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '8deg', '0deg'] });
  const pips = PIPS[shown] ?? PIPS[1];

  return (
    <Animated.View style={{ transform: [{ translateY: lift }, { rotate: rock }] }}>
      <View style={styles.die}>
        <View style={styles.pips}>
          {pips.map((on, index) => (
            <View key={index} style={styles.pipSlot}>
              {on ? <View style={styles.pip} /> : null}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
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
  diceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  die: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f6f0e3',
    borderWidth: 1,
    borderColor: '#e4d3b0',
  },
  pips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 4 },
  pipSlot: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
  pip: { width: '72%', height: '72%', borderRadius: 999, backgroundColor: '#241c14' },
  diceNote: { ...typography.body, color: colors.textDim },
  hintCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    gap: 8,
  },
  hintTitle: { ...typography.label, color: colors.accent },
  hintBody: { ...typography.body, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.5)',
  },
  chipHit: { backgroundColor: colors.dangerSoft, borderColor: 'rgba(232, 106, 92, 0.7)' },
  chipText: { ...typography.label },
  chipHitText: { color: colors.danger },
  chipQuiet: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipQuietText: { ...typography.label, color: colors.textDim },
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

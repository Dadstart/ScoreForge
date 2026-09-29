import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { ChineseCheckersBoard, goalCorners } from '../components/ChineseCheckersBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import {
  CORNERS,
  createChineseState,
  ensureChineseState,
  homeProgress,
  legalHops,
  normalizeSetup,
  paintedCamps,
  pieceAt,
  placeRows,
  playHop,
  playerCap,
  resign,
  rotationSteps,
  sameSetup,
  seatCorners,
  seatLabel,
  setupDetail,
  setupOf,
  setupSummary,
  stopJumping,
  usesFifteen,
  type ChineseSetup,
  type ChineseState,
} from '../domain/chineseCheckers';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChineseCheckers'>;
type Cell = { q: number; r: number };

export function ChineseCheckersScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selection, setSelection] = useState<Cell | null>(null);
  const [draft, setDraft] = useState<ChineseSetup | null>(null);
  const [confirmSetup, setConfirmSetup] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const saving = useRef(false);
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame(found);
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
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );
  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName) : null),
    [game, displayName],
  );

  useEffect(() => {
    if (!game) return;
    const next = ensureChineseState(game);
    if (next === game) return;
    void saveGame(next).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not set up the board');
    });
  }, [game]);

  const chinese = game?.chinese ?? null;
  const setupKey = chinese
    ? `${chinese.playerCount}|${chinese.mode}|${chinese.sets}|${chinese.twoSetGoals}`
    : '';
  const turnKey = chinese?.turnSeat ?? null;
  const chainKey = chinese?.chain ? `${chinese.chain.q},${chinese.chain.r}` : '';
  const moveKey = chinese?.lastMove ? `${chinese.lastMove.toQ},${chinese.lastMove.toR}` : '';
  useEffect(() => {
    setSelection(null);
    setConfirmReset(false);
    setConfirmResign(false);
  }, [turnKey, chainKey, moveKey, chinese?.over]);

  useEffect(() => {
    setDraft(null);
    setConfirmSetup(false);
  }, [setupKey]);

  const hops = useMemo(() => (chinese ? legalHops(chinese) : []), [chinese]);
  const selected = chinese?.chain ?? selection;

  const persist = async (next: Game, celebrate: boolean) => {
    if (!template || saving.current) return;
    saving.current = true;
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      await saveGame(next);
      setGame(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

  if (!game || !template || !snapshot || !chinese) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const shown = draft ?? setupOf(chinese);
  const cap = playerCap(game, template.maxPlayers);
  const finished = chinese.over;
  const dirty = Boolean(
    chinese.lastMove || chinese.finishedSeats.length || chinese.resignedSeats.length || chinese.chain,
  );
  const currentCorners = seatCorners(chinese, chinese.turnSeat);
  const currentColors = currentCorners.map((corner) => CORNERS[corner].name).join(' & ');
  const currentOwner = game.players.find((player) => player.id === chinese.owners[chinese.turnSeat]) ?? null;
  const yourTurn = currentOwner?.id === localPlayerId;
  const localSeat = localPlayerId ? chinese.owners.indexOf(localPlayerId) : -1;
  const rotation = localSeat >= 0 ? rotationSteps(seatCorners(chinese, localSeat)[0] ?? 0) : 0;
  const rows = placeRows(chinese);
  const winner = rows.find((row) => row.place === 1 && !row.resigned) ?? null;
  const currentName = currentOwner?.name ?? currentColors;
  const turnLine = yourTurn
    ? `Your turn · ${currentColors}`
    : currentOwner
      ? `${currentOwner.name}'s turn · ${currentColors}`
      : `${currentColors}'s turn`;
  const banner = finished
    ? winner
      ? `${namesFor(chinese, game.players, winner.seats)} wins`
      : 'Game over'
    : chinese.chain
      ? `${currentName} can jump again`
      : turnLine;

  const apply = async (nextChinese: ChineseState) => {
    const next: Game = {
      ...game,
      chinese: nextChinese,
      status: nextChinese.over ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const playBetween = (fromQ: number, fromR: number, toQ: number, toR: number) => {
    if (finished || saving.current) return false;
    const hop = hops.find(
      (candidate) =>
        candidate.fromQ === fromQ && candidate.fromR === fromR && candidate.toQ === toQ && candidate.toR === toR,
    );
    if (!hop) return false;
    const next = playHop(chinese, game.players, hop);
    if (!next) {
      setError('That move is no longer legal.');
      return false;
    }
    void apply(next);
    return true;
  };

  const onCell = (q: number, r: number) => {
    if (finished || saving.current) return;
    if (selected && selected.q === q && selected.r === r) {
      if (chinese.chain) void applyResult(stopJumping(chinese, game.players));
      else setSelection(null);
      return;
    }
    if (selected && playBetween(selected.q, selected.r, q, r)) return;
    const piece = pieceAt(chinese.pieces, q, r);
    if (
      piece &&
      currentCorners.includes(piece.corner) &&
      hops.some((hop) => hop.fromQ === q && hop.fromR === r)
    ) {
      setSelection({ q, r });
      return;
    }
    if (!chinese.chain) setSelection(null);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      chinese: createChineseState(game.players, chinese),
      events: [],
      status: 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    beginSuppress();
    setConfirmReset(false);
    setSelection(null);
    try {
      noteLocalResult(calculate(next, template));
      await persist(next, false);
    } finally {
      endSuppress(false);
    }
  };

  const onApplySetup = async () => {
    if (sameSetup(shown, chinese)) return;
    if (game.players.length > shown.playerCount) {
      setError(`This table seats ${shown.playerCount}, and ${game.players.length} players have already joined.`);
      return;
    }
    if (dirty && !confirmSetup) {
      setConfirmSetup(true);
      return;
    }
    const next: Game = {
      ...game,
      chinese: createChineseState(game.players, shown),
      status: 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    beginSuppress();
    setConfirmSetup(false);
    setDraft(null);
    setSelection(null);
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
    const next = resign(chinese, game.players);
    setConfirmResign(false);
    if (next) await apply(next);
  };

  const applyResult = async (nextChinese: ChineseState | null) => {
    if (!nextChinese) return;
    await apply(nextChinese);
  };

  const choose = (partial: Partial<ChineseSetup>) => {
    setDraft(normalizeSetup({ ...shown, ...partial }));
    setConfirmSetup(false);
    setError(null);
  };

  return (
    <Screen>
      <View
        style={[
          styles.screen,
          { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Chinese Checkers" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {rows.length > 0 ? (
            <Text style={styles.action}>
              {rows
                .map((row) => `${ordinal(row.place)} ${namesFor(chinese, game.players, row.seats)}${row.resigned ? ' · out' : ''}`)
                .join('  ·  ')}
            </Text>
          ) : null}
          {chinese.lastAction ? <Text style={styles.action}>{chinese.lastAction}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <ChineseCheckersBoard
              pieces={chinese.pieces}
              hops={finished ? [] : hops}
              selected={selected}
              lastMove={chinese.lastMove}
              camps={paintedCamps(chinese)}
              goals={goalCorners(currentCorners)}
              fifteen={usesFifteen(chinese)}
              rotation={rotation}
              disabled={finished}
              onCell={onCell}
              onDrop={playBetween}
            />
            <Text style={styles.hint}>
              Drag a piece onto a highlighted hole, or tap the piece and then the hole. Jump in a straight line and keep going, or tap the piece again to stop.
              Pieces are not captured. You can rest in the center, your own camp, or the opposite camp.
              {localSeat >= 0 ? ' Your camp is at the bottom.' : ''}
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={[typography.section, styles.section]}>Table</Text>
            <Text style={typography.body}>{setupSummary(shown)}</Text>
            <Text style={typography.body}>{setupDetail(shown)}</Text>
            <View style={styles.choiceRow}>
              {([2, 3, 4, 6] as const).map((count) => (
                <Choice
                  key={count}
                  label={`${count}`}
                  active={shown.playerCount === count}
                  onPress={() => choose({ playerCount: count })}
                />
              ))}
            </View>
            {shown.playerCount === 6 || shown.playerCount === 4 ? (
              <View style={styles.choiceRow}>
                <Choice label="All versus all" active={shown.mode === 'ffa'} onPress={() => choose({ mode: 'ffa' })} />
                <Choice label="Teams of two" active={shown.mode === 'teams'} onPress={() => choose({ mode: 'teams' })} />
              </View>
            ) : null}
            {shown.playerCount === 3 ? (
              <View style={styles.choiceRow}>
                <Choice label="One set" active={shown.sets === 1} onPress={() => choose({ sets: 1 })} />
                <Choice label="Two sets" active={shown.sets === 2} onPress={() => choose({ sets: 2 })} />
              </View>
            ) : null}
            {shown.playerCount === 2 ? (
              <View style={styles.choiceRow}>
                <Choice label="One set · 15" active={shown.sets === 1} onPress={() => choose({ sets: 1 })} />
                <Choice label="Two sets" active={shown.sets === 2} onPress={() => choose({ sets: 2 })} />
                <Choice label="Three sets" active={shown.sets === 3} onPress={() => choose({ sets: 3 })} />
              </View>
            ) : null}
            {shown.playerCount === 2 && shown.sets === 2 ? (
              <View style={styles.choiceRow}>
                <Choice
                  label="Opponent’s corners"
                  active={shown.twoSetGoals === 'opponent'}
                  onPress={() => choose({ twoSetGoals: 'opponent' })}
                />
                <Choice
                  label="One empty corner"
                  active={shown.twoSetGoals === 'empty'}
                  onPress={() => choose({ twoSetGoals: 'empty' })}
                />
              </View>
            ) : null}
            {!sameSetup(shown, chinese) ? (
              <Button
                label={confirmSetup ? 'Confirm reset' : dirty ? 'Reset to this setup' : 'Use this setup'}
                variant="primary"
                onPress={() => void onApplySetup()}
              />
            ) : null}

            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.playerRow}>
              {Array.from({ length: chinese.playerCount }, (_, seat) => {
                const ownerId = chinese.owners[seat];
                const player = ownerId ? game.players.find((item) => item.id === ownerId) : undefined;
                const corners = seatCorners(chinese, seat);
                const progress = homeProgress(chinese, seat);
                const place = rows.find((row) => row.seats.includes(seat));
                const active = seat === chinese.turnSeat && !finished;
                return (
                  <View key={seat} style={[styles.playerChip, active && styles.playerChipActive]}>
                    <View style={styles.swatches}>
                      {corners.map((corner) => (
                        <View key={corner} style={[styles.dot, { backgroundColor: CORNERS[corner].fill }]} />
                      ))}
                    </View>
                    <Text style={typography.label}>
                      {player?.name ?? corners.map((corner) => CORNERS[corner].name).join(' & ')}
                      {player?.id === localPlayerId ? ' · you' : ''}
                      {` · ${progress.home}/${progress.total}`}
                      {place
                        ? ` · ${ordinal(place.place)}${place.resigned ? ' out' : ''}`
                        : progress.home === progress.total
                          ? ' · home'
                          : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={typography.body}>
              {game.players.length < cap
                ? 'Share the code to fill the other seats. Anyone can move the color whose turn it is.'
                : 'Anyone can move the color whose turn it is.'}
            </Text>

            {!finished ? (
              <View style={styles.actions}>
                {chinese.chain ? (
                  <Button label="Stop jumping" variant="primary" onPress={() => void applyResult(stopJumping(chinese, game.players))} />
                ) : null}
                <Button
                  label={confirmResign ? 'Confirm resign' : chinese.mode === 'teams' ? 'Resign team' : 'Resign'}
                  variant="danger"
                  onPress={() => void onResign()}
                />
              </View>
            ) : (
              <Text style={typography.body}>Reset the board to play again.</Text>
            )}

            <View style={styles.actions}>
              <Button label={confirmReset ? 'Confirm reset' : 'Reset board'} onPress={() => void onReset()} />
              {game.players.length < cap ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Chinese Checkers"
            onDismiss={dismissCelebration}
          />
        ) : null}

        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={cap}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const next = withAddedPlayer(game, name, cap);
            await saveGame(next);
            setGame(next);
            setError(null);
          }}
        />
      </View>
    </Screen>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}>
      <Text style={[styles.choiceLabel, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

function namesFor(state: ChineseState, players: Game['players'], seats: number[]): string {
  return seats
    .map((seat) => {
      const id = state.owners[seat];
      const player = id ? players.find((item) => item.id === id) : undefined;
      return player?.name ?? seatLabel(state, players, seat);
    })
    .join(' and ');
}

function ordinal(place: number): string {
  const teen = place % 100;
  if (teen >= 11 && teen <= 13) return `${place}th`;
  const digit = place % 10;
  if (digit === 1) return `${place}st`;
  if (digit === 2) return `${place}nd`;
  if (digit === 3) return `${place}rd`;
  return `${place}th`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.md, gap: 8 },
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
  swatches: { flexDirection: 'row', gap: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.borderStrong },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  choiceLabel: { ...typography.label },
  error: { color: colors.danger },
});

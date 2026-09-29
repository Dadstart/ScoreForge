import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { SorryBoard } from '../components/SorryBoard';
import { Badge, Button, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import {
  PAWNS_PER_PLAYER,
  SORRY_COLORS,
  colorIndexFor,
  describeMove,
  drawCard,
  ensureSorryState,
  homeCount,
  legalMoves,
  passTurn,
  playMove,
  createSorryState,
  type SorryMove,
} from '../domain/sorry';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Sorry'>;

export function SorryScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selectedPawn, setSelectedPawn] = useState<number | null>(null);
  const [sorryMenu, setSorryMenu] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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
    const next = ensureSorryState(game);
    if (next === game) return;
    void saveGame(next).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not set up the board');
    });
  }, [game]);

  const sorry = game?.sorry ?? null;
  const drawnKey = sorry?.drawn ?? null;
  useEffect(() => {
    setSelectedPawn(null);
    setSorryMenu(false);
  }, [drawnKey, sorry?.currentPlayerId]);

  const moves = useMemo(
    () => (sorry && game ? legalMoves(sorry, game.players) : []),
    [sorry, game],
  );
  const visibleMoves =
    selectedPawn == null
      ? moves
      : moves.filter((move) => move.pawn === selectedPawn || ('pawn2' in move && move.pawn2 === selectedPawn));

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

  if (!game || !template || !snapshot || !sorry) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const target = game.targetScore ?? template.defaultTargetScore ?? PAWNS_PER_PLAYER;
  const current = game.players.find((player) => player.id === sorry.currentPlayerId) ?? null;
  const currentColor = current ? SORRY_COLORS[colorIndexFor(sorry, current.id)] : null;
  const yourTurn = current?.id === localPlayerId;
  const finished = Boolean(sorry.winnerId) || snapshot.isComplete;
  const movablePawns = [...new Set(moves.map((move) => move.pawn))];

  const banner = finished
    ? snapshot.winnerName
      ? `${snapshot.winnerName} got ${target} pawns home`
      : 'Game complete'
    : current
      ? `${yourTurn ? 'Your turn' : `${current.name}'s turn`} · ${currentColor?.name ?? ''} · draw a card, then move`
      : 'Waiting for a player';

  const apply = async (nextSorry: typeof sorry) => {
    const next: Game = {
      ...game,
      sorry: nextSorry,
      status: nextSorry.winnerId ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onDraw = async () => {
    const next = drawCard(sorry);
    if (!next) return;
    await apply(next);
  };

  const onPlay = async (move: SorryMove) => {
    const next = playMove(sorry, game.players, move, target);
    if (!next) {
      setError('That move is no longer legal.');
      return;
    }
    await apply(next);
  };

  const onPass = async () => {
    const next = passTurn(sorry, game.players);
    if (!next) return;
    await apply(next);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      sorry: createSorryState(game.players),
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

  const sorryMoves = uniqueSorryTargets(visibleMoves);
  const otherMoves = visibleMoves.filter((move) => move.type !== 'sorry');

  const boardAction = finished ? null : !sorry.drawn ? (
    <Button label={`Draw for ${current?.name ?? 'this turn'}`} variant="primary" onPress={() => void onDraw()} />
  ) : moves.length === 0 ? (
    <Button label="Can't move" variant="primary" onPress={() => void onPass()} />
  ) : (
    <View style={styles.boardMoves}>
      <View style={styles.pawns}>
        <FilterChip label="All" active={selectedPawn == null} onPress={() => setSelectedPawn(null)} />
        {Array.from({ length: PAWNS_PER_PLAYER }, (_, index) => (
          <FilterChip
            key={index}
            label={`${index + 1}`}
            active={selectedPawn === index}
            onPress={() => setSelectedPawn(index)}
          />
        ))}
      </View>
      {visibleMoves.length === 0 ? (
        <Text style={styles.boardMoveEmpty}>That pawn has no move with this card.</Text>
      ) : (
        <>
          {sorryMoves.length > 0 ? (
            <View style={styles.sorryMenu}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose a pawn to replace"
                onPress={() => setSorryMenu((open) => !open)}
                style={styles.sorryTrigger}
              >
                <Text style={styles.sorryTriggerText}>Choose</Text>
                <Text style={styles.sorryChevron}>{sorryMenu ? '▴' : '▾'}</Text>
              </Pressable>
              {sorryMenu
                ? sorryMoves.map((move) => {
                    const color = SORRY_COLORS[colorIndexFor(sorry, move.targetPlayerId)];
                    const name =
                      game.players.find((player) => player.id === move.targetPlayerId)?.name ?? 'Opponent';
                    return (
                      <Pressable
                        key={`${move.targetPlayerId}:${move.targetPawn}`}
                        accessibilityRole="button"
                        onPress={() => {
                          setSorryMenu(false);
                          void onPlay(move);
                        }}
                        style={[styles.sorryChoice, { backgroundColor: color.fill }]}
                      >
                        <Text style={[styles.sorryChoiceText, { color: color.ink }]}>
                          Replace {name}'s pawn {move.targetPawn + 1}
                        </Text>
                      </Pressable>
                    );
                  })
                : null}
            </View>
          ) : null}
          {otherMoves.map((move) => (
            <Pressable key={moveKey(move)} style={styles.move} onPress={() => void onPlay(move)}>
              <Text style={styles.moveText}>{describeMove(game.players, move)}</Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );

  return (
    <Screen>
      <View
        style={[
          styles.screen,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Sorry" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {sorry.lastAction ? <Text style={styles.action}>{sorry.lastAction}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <SorryBoard
              players={game.players}
              state={sorry}
              selectedPawn={selectedPawn}
              movablePawns={movablePawns}
              action={boardAction}
            />
            <Text style={styles.hint}>
              Clockwise track. A triangle in another color slides you and sends every pawn on that slide back to Start.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={styles.deckCount}>
              {sorry.deck.length} in the deck
              {sorry.discard.length ? ` · ${sorry.discard.length} discarded` : ''}
            </Text>

            {finished ? (
              <Text style={typography.body}>Every pawn is home. Reset the board to play again.</Text>
            ) : null}

            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.playerRow}>
              {game.players.map((player) => {
                const color = SORRY_COLORS[colorIndexFor(sorry, player.id)];
                const home = homeCount(sorry, player.id);
                const active = player.id === sorry.currentPlayerId;
                return (
                  <View
                    key={player.id}
                    style={[styles.playerChip, active && styles.playerChipActive]}
                  >
                    <View style={[styles.dot, { backgroundColor: color.fill }]} />
                    <Text style={typography.label}>
                      {player.name}
                      {player.id === localPlayerId ? ' · you' : ''} · {home}/{target}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.actions}>
              <Button
                label={confirmReset ? 'Confirm reset' : 'Reset board'}
                onPress={() => void onReset()}
              />
              {game.players.length < template.maxPlayers ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Sorry"
            onDismiss={dismissCelebration}
          />
        ) : null}

        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const next = withAddedPlayer(game, name, template.maxPlayers);
            await saveGame(next);
            setGame(next);
            setError(null);
          }}
        />
      </View>
    </Screen>
  );
}

function uniqueSorryTargets(moves: SorryMove[]): Extract<SorryMove, { type: 'sorry' }>[] {
  const seen = new Set<string>();
  const choices: Extract<SorryMove, { type: 'sorry' }>[] = [];
  for (const move of moves) {
    if (move.type !== 'sorry') continue;
    const key = `${move.targetPlayerId}:${move.targetPawn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push(move);
  }
  return choices;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function moveKey(move: SorryMove): string {
  switch (move.type) {
    case 'start':
      return `start-${move.pawn}`;
    case 'forward':
    case 'backward':
      return `${move.type}-${move.pawn}-${move.steps}`;
    case 'split':
      return `split-${move.pawn}-${move.steps}-${move.pawn2}-${move.steps2}`;
    case 'switch':
    case 'sorry':
      return `${move.type}-${move.pawn}-${move.targetPlayerId}-${move.targetPawn}`;
  }
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
  boardPane: { gap: 8 },
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
  deckCount: { ...typography.body, fontSize: 13 },
  boardMoves: { width: 260, gap: 8 },
  sorryMenu: { gap: 6, pointerEvents: 'auto' },
  sorryTrigger: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sorryTriggerText: { ...typography.body, fontWeight: '600' },
  sorryChevron: { color: colors.muted, fontSize: 16 },
  sorryChoice: {
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sorryChoiceText: { fontSize: 15, fontWeight: '700' },
  boardMoveEmpty: { ...typography.body, textAlign: 'center', fontSize: 13 },
  pawns: { flexDirection: 'row', gap: 8 },
  chip: {
    minWidth: 36,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...typography.label },
  chipTextActive: { color: colors.accentText },
  move: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  moveText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
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
  dot: { width: 14, height: 14, borderRadius: 7 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

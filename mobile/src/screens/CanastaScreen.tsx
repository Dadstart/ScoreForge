import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { CanastaBoard } from '../components/CanastaBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { PlaySpark } from '../components/PlaySpark';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen, usePageScroll } from '../components/ui';
import {
  CANASTA_TARGET,
  addToMeld,
  canTakeDiscard,
  createCanastaState,
  dealNext,
  arrangeHand,
  sortPlayerHand,
  discard,
  drawStock,
  ensureCanastaState,
  meldNew,
  takeDiscard,
  undoMove,
  type CanastaResult,
  type CanastaState,
} from '../domain/canasta';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Canasta'>;

function canastaCount(state: CanastaState): number {
  return state.teams.reduce(
    (sum, team) => sum + team.melds.filter((meld) => meld.rank !== 3 && meld.cards.length >= 7).length,
    0,
  );
}

export function CanastaScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
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
  } = useLiveGame(route.params.gameId, {
    repair: ensureCanastaState,
    repairError: 'Could not deal the cards',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { sparks, spark } = usePlaySpark();
  usePageScroll(!dragging);
  const prior = useRef<CanastaState | null>(null);
  const table = game?.canasta ?? null;

  useEffect(() => {
    const previous = prior.current;
    prior.current = table;
    if (!previous || !table) return;
    if (canastaCount(table) > canastaCount(previous)) spark('Canasta', 'gold');
  }, [table, spark]);

  useEffect(() => {
    setSelected(new Set());
  }, [table?.turn, table?.phase]);

  if (!game || !template || !snapshot || !table) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const passAndPlay = playModeOf(game) === 'pass-and-play';
  const target = game.targetScore ?? template.defaultTargetScore ?? CANASTA_TARGET;
  const names = game.players.map((player) => ({ id: player.id, name: player.name }));
  const turnPlayer = game.players.find((player) => player.id === table.turn) ?? null;
  const covered =
    passAndPlay &&
    (table.phase === 'draw' || table.phase === 'play') &&
    table.turn != null &&
    revealed !== table.turn;
  const canAct =
    !covered &&
    (table.phase === 'draw' || table.phase === 'play') &&
    deviceMayAct(game, localPlayerId, table.turn);
  const handOwnerId = covered ? null : passAndPlay ? table.turn : localPlayerId;
  const canDeal =
    table.phase === 'handOver' && (passAndPlay || (localPlayerId != null && table.order.includes(localPlayerId)));
  const previous = table.history?.[table.history.length - 1];
  const canUndo =
    previous != null &&
    (passAndPlay ||
      (localPlayerId != null &&
        (previous.turn === localPlayerId || (previous.turn == null && table.order.includes(localPlayerId)))));

  const apply = async (result: CanastaResult) => {
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setSelected(new Set());
    const next: Game = {
      ...game,
      canasta: result.state,
      status: result.state.phase === 'gameOver' ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, result.state.phase === 'gameOver');
  };

  const undoButton = canUndo ? (
    <Button label="Undo" disabled={saving.current} onPress={() => void apply(undoMove(table))} />
  ) : null;

  const saveLayout = (result: CanastaResult) => {
    if ('error' in result) {
      setError(result.error);
      return;
    }
    if (result.state === table) return;
    setError(null);
    const next: Game = {
      ...game,
      canasta: result.state,
      status: game.status,
      updatedAt: new Date().toISOString(),
    };
    void persist(next, false);
  };

  const arrange = (order: readonly string[]) => {
    if (!handOwnerId) return;
    saveLayout(arrangeHand(table, handOwnerId, order));
  };

  const sortVisibleHand = () => {
    if (!handOwnerId) return;
    saveLayout(sortPlayerHand(table, handOwnerId));
  };

  const canSort = handOwnerId != null && (table.hands[handOwnerId]?.length ?? 0) > 1;

  const toggle = (card: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(card)) next.delete(card);
      else next.add(card);
      return next;
    });
  };

  const banner =
    table.phase === 'waiting'
      ? 'Waiting for another player.'
      : table.phase === 'gameOver'
        ? (table.lastAction ?? 'The game is over.')
        : table.phase === 'handOver'
          ? 'The hand is over.'
          : covered
            ? `Pass the device to ${turnPlayer?.name ?? 'the next player'}.`
            : `${turnPlayer?.name ?? 'A player'} ${table.phase === 'draw' ? (table.order.length === 2 ? 'draws two cards or takes the pack' : 'draws or takes the pack') : 'melds, then discards'}.`;

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label={`Canasta · ${target.toLocaleString()}`} tone="accent" />
          </View>
          <GameHelp templateId="canasta" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={passAndPlay} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {table.lastAction && table.phase !== 'gameOver' ? <Text style={styles.action}>{table.lastAction}</Text> : null}
          {table.lastScores ? (
            <View style={styles.scores}>
              {table.lastScores.map((score) => {
                const team = table.teams[score.team];
                const who = team?.playerIds.map((id) => names.find((player) => player.id === id)?.name ?? 'Player').join(' and ');
                return (
                  <Text key={score.team} style={styles.scoreLine}>
                    {who}: {score.points > 0 ? '+' : ''}
                    {score.points} ({score.lines.map((line) => `${line.label} ${line.points > 0 ? '+' : ''}${line.points}`).join(', ')})
                  </Text>
                );
              })}
            </View>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {table.phase === 'waiting' ? (
          <Button label="Add player" variant="primary" onPress={() => setAddingPlayer(true)} />
        ) : (
          <CanastaBoard
            state={table}
            players={names}
            handOwnerId={handOwnerId}
            selected={selected}
            canAct={canAct}
            onToggle={toggle}
            onMeldPress={(meldIndex) => {
              if (!handOwnerId || selected.size === 0) return;
              void apply(addToMeld(table, handOwnerId, meldIndex, [...selected], names, target));
            }}
            onDraw={() => {
              if (table.turn) void apply(drawStock(table, table.turn, names, target));
            }}
            onTake={() => {
              if (table.turn) void apply(takeDiscard(table, table.turn, names));
            }}
            onDiscard={(card) => {
              if (handOwnerId) void apply(discard(table, handOwnerId, card, names, target));
            }}
            onArrange={arrange}
            onDragChange={setDragging}
          />
        )}

        {covered ? (
          <Button label={`Show ${turnPlayer?.name ?? 'the'} hand`} variant="primary" onPress={() => setRevealed(table.turn)} />
        ) : null}

        {canAct && table.phase === 'draw' ? (
          <View style={styles.actions}>
            <Button
              label={table.order.length === 2 ? 'Draw 2' : 'Draw'}
              variant="primary"
              disabled={saving.current}
              onPress={() => {
                if (table.turn) void apply(drawStock(table, table.turn, names, target));
              }}
            />
            <Button
              label="Take pack"
              disabled={saving.current || !table.turn || !canTakeDiscard(table, table.turn)}
              onPress={() => {
                if (table.turn) void apply(takeDiscard(table, table.turn, names));
              }}
            />
            {undoButton}
            {canSort ? (
              <Button label="Sort hand" disabled={saving.current} onPress={sortVisibleHand} />
            ) : null}
          </View>
        ) : null}

        {canAct && table.phase === 'play' && handOwnerId ? (
          <View style={styles.actions}>
            <Button
              label={selected.size >= 3 ? `Meld ${selected.size}` : 'Meld'}
              variant="primary"
              disabled={saving.current || selected.size < 3}
              onPress={() => void apply(meldNew(table, handOwnerId, [...selected], names, target))}
            />
            <Button
              label="Discard"
              disabled={saving.current || selected.size !== 1}
              onPress={() => {
                const card = [...selected][0];
                if (card) void apply(discard(table, handOwnerId, card, names, target));
              }}
            />
            {undoButton}
            {canSort ? <Button label="Sort hand" disabled={saving.current} onPress={sortVisibleHand} /> : null}
          </View>
        ) : null}

        {canSort && !(canAct && (table.phase === 'draw' || (table.phase === 'play' && handOwnerId))) ? (
          <Button label="Sort hand" disabled={saving.current} onPress={sortVisibleHand} />
        ) : null}

        {canUndo && !(canAct && (table.phase === 'draw' || table.phase === 'play')) ? undoButton : null}

        {canDeal ? (
          <Button
            label="Deal the next hand"
            variant="primary"
            disabled={saving.current}
            onPress={() => void apply(dealNext(table, names))}
          />
        ) : null}

        {table.phase === 'gameOver' ? (
          <Button
            label="Deal a new game"
            variant="primary"
            disabled={saving.current}
            onPress={() => void apply({ state: createCanastaState(game.players) })}
          />
        ) : null}

        <Text style={styles.hint}>
          Tap cards in your hand, then Meld. Drag cards around to arrange your hand, or use Sort hand to put them in rank order. Drag one onto the pack to discard it. Tap one of your melds to add the
          selected cards. Undo takes back the last draw, meld, or discard. A wild card in the pack freezes it, and a black three on top blocks it.
        </Text>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Canasta" onDismiss={dismissCelebration} />
        ) : null}

        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
            setGame((current) => preferNewerGame(current, saved));
            setAddingPlayer(false);
            setError(null);
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.md, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
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
  scores: { gap: 2 },
  scoreLine: { fontSize: 12, color: colors.text },
  error: { ...typography.body, color: colors.danger },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted },
});

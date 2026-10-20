import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { PlaySpark } from '../components/PlaySpark';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { SkipBeauxBoard } from '../components/SkipBeauxBoard';
import { Badge, Button, Screen } from '../components/ui';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import {
  SKIP_BEAUX_TARGET,
  createSkipBeauxState,
  dealGame,
  dealNext,
  discardCard,
  endTurn,
  ensureSkipBeauxState,
  playBuilding,
  type CardSource,
  type SkipBeauxResult,
} from '../domain/skipBeaux';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SkipBeaux'>;

export function SkipBeauxScreen({ navigation, route }: Props) {
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
    repair: ensureSkipBeauxState,
    repairError: 'Could not deal the cards',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { sparks, spark } = usePlaySpark();
  const prior = useRef(game?.skipBeaux ?? null);
  useEffect(() => {
    const table = game?.skipBeaux ?? null;
    const previous = prior.current;
    prior.current = table;
    if (!previous || !table) return;
    const wentOut =
      previous.phase !== 'handOver' &&
      previous.phase !== 'gameOver' &&
      (table.phase === 'handOver' || table.phase === 'gameOver');
    const finished = table.completed.length > previous.completed.length;
    if (wentOut) spark('Out', 'gold');
    else if (finished) spark('12', 'gold');
    else if (table.lastAction !== previous.lastAction && table.lastAction?.includes('plays Beaux')) spark('Beaux', 'gold');
  }, [game?.skipBeaux, spark]);

  if (!game || !template || !snapshot || !game.skipBeaux) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const table = game.skipBeaux;
  const passAndPlay = playModeOf(game) === 'pass-and-play';
  const target = game.targetScore ?? template.defaultTargetScore ?? SKIP_BEAUX_TARGET;
  const names = game.players.map((player) => ({ id: player.id, name: player.name }));
  const turnPlayer = game.players.find((player) => player.id === table.turn) ?? null;
  const covered = passAndPlay && table.phase === 'play' && table.turn != null && revealed !== table.turn;
  const canAct = !covered && table.phase === 'play' && deviceMayAct(game, localPlayerId, table.turn);
  const handOwnerId = covered ? null : passAndPlay ? table.turn : localPlayerId;
  const seated = localPlayerId != null && (table.order.length === 0 || table.order.includes(localPlayerId) || game.players.some((player) => player.id === localPlayerId));
  const canDeal = (table.phase === 'waiting' || table.phase === 'handOver') && (passAndPlay || seated);
  const handEmpty = table.turn != null && (table.hands[table.turn]?.length ?? 0) === 0;

  const apply = async (result: SkipBeauxResult) => {
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    const next: Game = {
      ...game,
      skipBeaux: result.state,
      status: result.state.phase === 'gameOver' ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, result.state.phase === 'gameOver');
  };

  const banner =
    table.phase === 'waiting'
      ? 'Deal when everyone who is playing has joined.'
      : table.phase === 'gameOver'
        ? (table.lastAction ?? 'The game is over.')
        : table.phase === 'handOver'
          ? 'The hand is over.'
          : covered
            ? `Pass the device to ${turnPlayer?.name ?? 'the next player'}.`
            : handEmpty
              ? `${turnPlayer?.name ?? 'A player'} can play the stock or a discard, then end the turn.`
              : `${turnPlayer?.name ?? 'A player'} builds from 1 to 12, then discards.`;

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label={`Skip-Beaux · ${target.toLocaleString()}`} tone="accent" />
          </View>
          <GameHelp templateId="skip-beaux" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={passAndPlay} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {table.lastAction && table.phase !== 'gameOver' ? <Text style={styles.action}>{table.lastAction}</Text> : null}
          {table.lastScores ? (
            <View style={styles.scores}>
              {table.lastScores.map((score) => (
                <Text key={score.playerId} style={styles.scoreLine}>
                  {names.find((player) => player.id === score.playerId)?.name ?? 'Player'}: +{score.points}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {table.phase === 'waiting' ? (
          <Button label="Add player" variant="secondary" onPress={() => setAddingPlayer(true)} />
        ) : (
          <SkipBeauxBoard
            state={table}
            players={names}
            handOwnerId={handOwnerId}
            canAct={canAct}
            onPlay={(source: CardSource, building) => {
              if (table.turn) void apply(playBuilding(table, table.turn, source, building, names, target));
            }}
            onDiscard={(card, pile) => {
              if (table.turn) void apply(discardCard(table, table.turn, card, pile, names));
            }}
          />
        )}

        <View style={styles.actions}>
          {covered ? (
            <Button label={`Show ${turnPlayer?.name ?? 'hand'}`} variant="primary" onPress={() => setRevealed(table.turn)} />
          ) : null}
          {canAct && handEmpty && table.turn ? (
            <Button
              label="End turn"
              variant="secondary"
              disabled={saving.current}
              onPress={() => void apply(endTurn(table, table.turn as string, names))}
            />
          ) : null}
          {table.phase === 'waiting' && canDeal ? (
            <Button label="Deal the cards" variant="primary" disabled={saving.current} onPress={() => void apply(dealGame(names))} />
          ) : null}
          {table.phase === 'handOver' && canDeal ? (
            <Button label="Deal the next hand" variant="primary" disabled={saving.current} onPress={() => void apply(dealNext(table, names))} />
          ) : null}
          {table.phase === 'gameOver' && (passAndPlay || seated) ? (
            <Button
              label="Deal a new game"
              variant="primary"
              disabled={saving.current}
              onPress={() => {
                const fresh = createSkipBeauxState(names);
                void apply({ state: { ...fresh, totals: Object.fromEntries(names.map((player) => [player.id, 0])) } });
              }}
            />
          ) : null}
        </View>
        <PlaySpark sparks={sparks} />
      </View>

      {showCelebration ? (
        <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Skip-Beaux" onDismiss={dismissCelebration} />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: space.md, paddingHorizontal: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  banner: { backgroundColor: colors.surface, borderRadius: radii.md, padding: space.sm, gap: 4 },
  bannerText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  action: { color: colors.muted, fontSize: 14 },
  scores: { gap: 2 },
  scoreLine: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

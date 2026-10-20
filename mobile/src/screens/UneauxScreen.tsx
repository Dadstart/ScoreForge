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
import { UneauxBoard } from '../components/UneauxBoard';
import { Badge, Button, Screen } from '../components/ui';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import {
  UNEAUX_TARGET,
  callUneaux,
  canPlayCard,
  cardLabel,
  catchUneaux,
  chooseColor,
  createUneauxState,
  dealNext,
  drawCard,
  ensureUneauxState,
  kindOf,
  passTurn,
  playCard,
  type UneauxColor,
  type UneauxResult,
} from '../domain/uneaux';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Uneaux'>;

export function UneauxScreen({ navigation, route }: Props) {
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
    repair: ensureUneauxState,
    repairError: 'Could not deal the cards',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { sparks, spark } = usePlaySpark();
  const prior = useRef(game?.uneaux ?? null);
  useEffect(() => {
    const table = game?.uneaux ?? null;
    const previous = prior.current;
    prior.current = table;
    if (!previous || !table) return;
    const before = previous.discard.at(-1);
    const after = table.discard.at(-1);
    if (after && after !== before) {
      const kind = kindOf(after);
      if (kind === 'S') spark('Skip', 'rose');
      else if (kind === 'V') spark('Reverse', 'gold');
      else if (kind === 'D') spark('Draw 2', 'rose');
      else if (kind === 'W') spark('Wild', 'gold');
      else if (kind === 'F') spark('Draw 4', 'rose');
    }
    if (previous.pendingCall && !table.pendingCall && table.lastAction?.includes('says Uneaux')) spark('Uneaux', 'gold');
    if (
      previous.phase !== 'handOver' &&
      previous.phase !== 'gameOver' &&
      (table.phase === 'handOver' || table.phase === 'gameOver')
    ) {
      spark('Out', 'gold');
    }
  }, [game?.uneaux, spark]);

  if (!game || !template || !snapshot || !game.uneaux) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const table = game.uneaux;
  const passAndPlay = playModeOf(game) === 'pass-and-play';
  const target = game.targetScore ?? template.defaultTargetScore ?? UNEAUX_TARGET;
  const names = game.players.map((player) => ({ id: player.id, name: player.name }));
  const turnPlayer = game.players.find((player) => player.id === table.turn) ?? null;
  const covered =
    passAndPlay &&
    (table.phase === 'play' || table.phase === 'color') &&
    table.turn != null &&
    revealed !== table.turn;
  const canAct =
    !covered &&
    (table.phase === 'play' || table.phase === 'color') &&
    deviceMayAct(game, localPlayerId, table.turn);
  const handOwnerId = covered ? null : passAndPlay ? table.turn : localPlayerId;
  const seated = localPlayerId != null && table.order.includes(localPlayerId);
  const canDeal = table.phase === 'handOver' && (passAndPlay || seated);
  const caller = table.pendingCall;
  const canCall =
    caller != null &&
    (table.phase === 'play' || table.phase === 'color') &&
    (passAndPlay ? covered || caller === table.turn : localPlayerId === caller);
  const canCatch = canAct && caller != null && caller !== table.turn && table.phase === 'play' && table.drawn == null;
  const drawnCard = table.drawn;
  const canPlayDrawn =
    canAct && table.phase === 'play' && drawnCard != null && table.turn != null && canPlayCard(table, table.turn, drawnCard);

  const apply = async (result: UneauxResult) => {
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    const next: Game = {
      ...game,
      uneaux: result.state,
      status: result.state.phase === 'gameOver' ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, result.state.phase === 'gameOver');
  };

  const banner =
    table.phase === 'waiting'
      ? 'Waiting for another player.'
      : table.phase === 'gameOver'
        ? (table.lastAction ?? 'The game is over.')
        : table.phase === 'handOver'
          ? 'The hand is over.'
          : table.phase === 'color'
            ? covered
              ? `Pass the device to ${turnPlayer?.name ?? 'the next player'}.`
              : `${turnPlayer?.name ?? 'A player'} names a color.`
            : covered
              ? `Pass the device to ${turnPlayer?.name ?? 'the next player'}.`
              : drawnCard
                ? canPlayDrawn
                  ? `${turnPlayer?.name ?? 'A player'} may play ${cardLabel(drawnCard)} or pass.`
                  : `${turnPlayer?.name ?? 'A player'} cannot play the drawn card and must pass.`
                : `${turnPlayer?.name ?? 'A player'} matches the color or the symbol.`;

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label={`Uneaux · ${target.toLocaleString()}`} tone="accent" />
          </View>
          <GameHelp templateId="uneaux" />
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
          <Button label="Add player" variant="primary" onPress={() => setAddingPlayer(true)} />
        ) : (
          <UneauxBoard
            state={table}
            players={names}
            handOwnerId={handOwnerId}
            canAct={canAct}
            onPlay={(card) => {
              if (table.turn) void apply(playCard(table, table.turn, card, names));
            }}
            onDraw={() => {
              if (table.turn) void apply(drawCard(table, table.turn, names));
            }}
            onColor={(color: UneauxColor) => {
              if (table.turn) void apply(chooseColor(table, table.turn, color, names));
            }}
          />
        )}

        <View style={styles.actions}>
          {covered ? (
            <Button label={`Show ${turnPlayer?.name ?? 'hand'}`} variant="primary" onPress={() => setRevealed(table.turn)} />
          ) : null}
          {canCall && caller ? (
            <Button
              label="Call Uneaux"
              variant="primary"
              disabled={saving.current}
              onPress={() => void apply(callUneaux(table, caller, names))}
            />
          ) : null}
          {canCatch && table.turn ? (
            <Button
              label="Catch"
              variant="secondary"
              disabled={saving.current}
              onPress={() => void apply(catchUneaux(table, table.turn as string, names))}
            />
          ) : null}
          {canAct && table.phase === 'play' && table.drawn == null && table.turn ? (
            <Button
              label="Draw"
              variant="secondary"
              disabled={saving.current}
              onPress={() => void apply(drawCard(table, table.turn as string, names))}
            />
          ) : null}
          {canPlayDrawn && drawnCard && table.turn ? (
            <Button
              label={`Play ${cardLabel(drawnCard)}`}
              variant="primary"
              disabled={saving.current}
              onPress={() => void apply(playCard(table, table.turn as string, drawnCard, names))}
            />
          ) : null}
          {canAct && table.phase === 'play' && table.drawn != null && table.turn ? (
            <Button
              label="Pass"
              variant="secondary"
              disabled={saving.current}
              onPress={() => void apply(passTurn(table, table.turn as string, names))}
            />
          ) : null}
          {canDeal ? (
            <Button label="Deal the next hand" variant="primary" disabled={saving.current} onPress={() => void apply(dealNext(table, names))} />
          ) : null}
          {table.phase === 'gameOver' && (passAndPlay || seated) ? (
            <Button
              label="Deal a new game"
              variant="primary"
              disabled={saving.current}
              onPress={() => {
                const fresh = createUneauxState(names);
                void apply({ state: { ...fresh, totals: Object.fromEntries(names.map((player) => [player.id, 0])) } });
              }}
            />
          ) : null}
        </View>
        <PlaySpark sparks={sparks} />
      </View>

      {showCelebration ? (
        <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Uneaux" onDismiss={dismissCelebration} />
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
  banner: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: space.sm,
    gap: 4,
  },
  bannerText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  action: { color: colors.muted, fontSize: 14 },
  scores: { gap: 2 },
  scoreLine: { color: colors.text, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

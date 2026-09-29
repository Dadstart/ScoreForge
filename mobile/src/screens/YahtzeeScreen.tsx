import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { YahtzeeScoreboard, YahtzeeScoreModal } from '../components/YahtzeeScoreboard';
import { Badge, Button, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import {
  boxById,
  buildPlayerCard,
  isScorecardComplete,
  UPPER_BONUS,
  UPPER_BONUS_AT,
  YAHTZEE_BONUS_BOX,
  withBoxScore,
  withoutBox,
  withoutLastCardEntry,
} from '../domain/yahtzee';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Yahtzee'>;

export function YahtzeeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [editing, setEditing] = useState<{ playerId: string; boxId: string } | null>(null);
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

  const cards = useMemo(() => {
    if (!game || !snapshot) return [];
    return game.players.map((player) => {
      const standing = snapshot.standings.find((row) => row.playerId === player.id);
      return buildPlayerCard(game.events, player, {
        isYou: player.id === localPlayerId,
        isWinner: standing?.isWinner ?? false,
        isLeader: standing?.isLeader ?? false,
      });
    });
  }, [game, snapshot, localPlayerId]);

  const editingCard = cards.find((card) => card.playerId === editing?.playerId) ?? null;
  const editingBox = editing ? (boxById(editing.boxId) ?? null) : null;

  const persist = async (next: Game) => {
    await saveGame(next);
    setGame(next);
  };

  const applyGame = async (
    mutator: (current: Game) => Game,
    opts?: { suppressWin?: boolean; forceComplete?: boolean },
  ) => {
    if (!game || !template) return;
    const next = mutator({
      ...game,
      players: [...game.players],
      events: [...game.events],
    });
    next.status =
      opts?.forceComplete || isScorecardComplete(next) ? 'Completed' : 'InProgress';
    const snap = calculate(next, template);
    if (opts?.suppressWin || !snap.isComplete) {
      beginSuppress();
      try {
        noteLocalResult(snap);
        await persist(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Autosave failed');
      } finally {
        endSuppress(snap.isComplete);
      }
      return;
    }
    try {
      noteLocalResult(snap);
      await persist(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Autosave failed');
    }
  };

  if (!game || !template || !snapshot) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const locked = snapshot.isComplete;
  const banner = locked
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins with ${snapshot.standings.find((row) => row.isWinner)?.total ?? 0}`
      : 'Card complete'
    : 'Tap a box in any column.';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 28),
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Yahtzee" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Button
            label="Undo"
            onPress={() => {
              void applyGame(
                (current) => ({
                  ...current,
                  events: withoutLastCardEntry(current.events),
                }),
                { suppressWin: true },
              );
            }}
            disabled={!game.events.some((event) => event.box && event.box !== YAHTZEE_BONUS_BOX)}
          />
          <Button
            label="Reset card"
            onPress={() =>
              void applyGame(
                (current) => ({ ...current, events: [], status: 'InProgress' }),
                { suppressWin: true },
              )
            }
          />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
          {!locked ? (
            <Button
              label="Mark complete"
              onPress={() => void applyGame((current) => current, { forceComplete: true })}
            />
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <YahtzeeScoreboard
          players={cards}
          locked={locked}
          onPressBox={(playerId, boxId) => setEditing({ playerId, boxId })}
        />

        <Text style={styles.note}>
          Upper section bonus is {UPPER_BONUS} once that section reaches {UPPER_BONUS_AT}. After a 50 in
          Yahtzee, each other five-of-a-kind adds 100. Enter 0 to scratch a box. Highest total wins.
        </Text>
      </ScrollView>

      <YahtzeeScoreModal
        visible={editing != null && editingBox != null && !locked}
        box={editingBox}
        playerName={editingCard?.name}
        current={editingBox ? (editingCard?.boxes[editingBox.id] ?? null) : null}
        onClose={() => setEditing(null)}
        onSave={(points) => {
          if (!editing || !editingBox) return;
          const playerId = editing.playerId;
          const boxId = editingBox.id;
          setEditing(null);
          void applyGame((current) => ({
            ...current,
            events: withBoxScore(current.events, playerId, boxId, points),
          }));
        }}
        onClear={() => {
          if (!editing || !editingBox) return;
          const playerId = editing.playerId;
          const boxId = editingBox.id;
          setEditing(null);
          void applyGame(
            (current) => ({
              ...current,
              events: withoutBox(current.events, playerId, boxId),
            }),
            { suppressWin: true },
          );
        }}
      />

      {showCelebration ? (
        <FireworksOverlay
          winnerName={snapshot.winnerName}
          subtitle="Yahtzee"
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
          await persist(next);
          setError(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 12,
    borderRadius: radii.md,
  },
  bannerText: { ...typography.label, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
  note: { ...typography.body, fontSize: 13 },
});

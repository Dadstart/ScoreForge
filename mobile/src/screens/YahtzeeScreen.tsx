import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { YahtzeeScoreboard, YahtzeeScoreModal } from '../components/YahtzeeScoreboard';
import { Badge, Button, Screen } from '../components/ui';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game, ScoreEvent } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import {
  boxById,
  buildPlayerCard,
  isScorecardComplete,
  scoreForBox,
  UPPER_BONUS,
  UPPER_BONUS_AT,
  YAHTZEE_BONUS_BOX,
  YAHTZEE_BOXES,
  withBoxScore,
  withoutBox,
  withoutLastCardEntry,
  yahtzeeBonusCount,
  type YahtzeeBox,
} from '../domain/yahtzee';
import { usePlaySpark, type SparkTone } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
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
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );
  const seenScores = useRef<ScoreEvent[] | null>(null);
  useEffect(() => {
    if (!game) return;
    const prior = seenScores.current;
    seenScores.current = game.events;
    if (!prior || game.events.length <= prior.length) return;
    const added = game.events[game.events.length - 1];
    if (!added?.box || added.box === YAHTZEE_BONUS_BOX) return;
    const box = boxById(added.box);
    if (!box) return;
    const cheer = yahtzeeCheer(box, added.points, prior, game.events, added.playerId);
    if (cheer) spark(cheer.label, cheer.tone);
  }, [game, spark]);
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
    const saved = await saveGame(next);
    setGame((current) => preferNewerGame(current, saved));
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
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
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
      <View
        style={[
          styles.content,
          {
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 28),
          },
        ]}
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
      </View>

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

      <PlaySpark sparks={sparks} />
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
          const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
          setGame((current) => preferNewerGame(current, saved));
          setError(null);
        }}
      />
    </Screen>
  );
}

function yahtzeeCheer(
  box: YahtzeeBox,
  points: number,
  before: ScoreEvent[],
  after: ScoreEvent[],
  playerId: string,
): { label: string; tone: SparkTone } | null {
  if (box.id === 'yahtzee' && points === 50) return { label: 'Yahtzee!', tone: 'gold' };
  if (yahtzeeBonusCount(after, playerId) > yahtzeeBonusCount(before, playerId)) {
    return { label: '+100', tone: 'gold' };
  }
  const upperBefore = upperSum(before, playerId);
  const upperAfter = upperSum(after, playerId);
  if (upperBefore < UPPER_BONUS_AT && upperAfter >= UPPER_BONUS_AT) return { label: 'Bonus!', tone: 'gold' };
  if (box.kind === 'fixed' && points > 0 && points === box.fixed) {
    if (box.id === 'fullHouse') return { label: 'Full house!', tone: 'gold' };
    if (box.id === 'smallStraight' || box.id === 'largeStraight') return { label: 'Straight!', tone: 'gold' };
  }
  if (box.kind === 'face' && box.face && points === box.face * 5) return { label: 'Five!', tone: 'gold' };
  return null;
}

function upperSum(events: ScoreEvent[], playerId: string): number {
  return YAHTZEE_BOXES.filter((box) => box.section === 'upper').reduce(
    (sum, box) => sum + (scoreForBox(events, playerId, box.id) ?? 0),
    0,
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

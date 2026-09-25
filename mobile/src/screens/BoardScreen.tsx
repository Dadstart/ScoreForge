import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Field, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import { findLocalPlayerId, nextRoundForPlayer } from '../domain/localPlayer';
import { createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Board'>;

export function BoardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enteringScore, setEnteringScore] = useState(false);
  const [myRoundScore, setMyRoundScore] = useState('0');
  const [addingPlayer, setAddingPlayer] = useState(false);
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
      (next) => {
        setGame(next);
        if (next) {
          const tmpl = getTemplate(next.templateId);
          if (tmpl) onSnapshot(calculate(next, tmpl));
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
  const localPlayer = game?.players.find((p) => p.id === localPlayerId) ?? null;

  const persist = async (next: Game) => {
    try {
      await saveGame(next);
      setGame(next);
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

  const isInstant = template.scoringMode === 'Instant';
  const isRounds = template.scoringMode === 'Rounds';
  const complete = snapshot.isComplete;

  const applyGame = async (mutator: (g: Game) => Game, opts?: { suppressWin?: boolean }) => {
    const next = mutator({
      ...game,
      players: [...game.players],
      events: [...game.events],
    });
    const snap = calculate(next, template);
    if (snap.isComplete) next.status = 'Completed';
    else if (next.status === 'Completed' && !snap.isComplete) next.status = 'InProgress';

    if (opts?.suppressWin || !snap.isComplete) {
      beginSuppress();
      try {
        noteLocalResult(snap);
        await persist(next);
      } finally {
        endSuppress(snap.isComplete);
      }
      return;
    }

    noteLocalResult(snap);
    await persist(next);
  };

  const adjust = async (playerId: string, delta: number) => {
    if (!isInstant || complete) return;
    if (playerId !== localPlayerId) {
      setError('You can only change your own score.');
      return;
    }
    await applyGame((g) => {
      g.events.push(createScoreEvent(playerId, delta));
      return g;
    });
  };

  const undo = async () => {
    if (!localPlayerId) {
      setError('Set your display name to match a player before undoing.');
      return;
    }
    await applyGame(
      (g) => {
        for (let i = g.events.length - 1; i >= 0; i--) {
          if (g.events[i].playerId === localPlayerId) {
            g.events.splice(i, 1);
            break;
          }
        }
        return g;
      },
      { suppressWin: true },
    );
  };

  const submitMyScore = async () => {
    if (!localPlayerId || !localPlayer) {
      setError('Set your display name to match a player before scoring.');
      return;
    }
    const points = Number.parseInt(myRoundScore, 10);
    if (Number.isNaN(points)) {
      setError(`Invalid score for ${localPlayer.name}.`);
      return;
    }
    const round = nextRoundForPlayer(game, localPlayerId);
    await applyGame((g) => {
      g.events.push(createScoreEvent(localPlayerId, points, round));
      return g;
    });
    setEnteringScore(false);
    setMyRoundScore('0');
  };

  const banner = complete
    ? snapshot.winnerName
      ? `Winner: ${snapshot.winnerName}`
      : 'Game complete'
    : !localPlayer
      ? 'Set your display name (Join / Setup) to match a player before scoring'
      : isInstant
        ? `Scoring as ${localPlayer.name} · Tap +/− on your card`
        : template.winCondition === 'FirstToTarget'
          ? `First to ${game.targetScore ?? template.defaultTargetScore} · ${localPlayer.name}`
          : template.winCondition === 'LowestTotal'
            ? `${localPlayer.name} · Lowest wins`
            : `${localPlayer.name} · Highest wins`;

  return (
    <Screen>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={typography.title}>{game.name}</Text>
              <Badge label={template.name} tone="accent" />
            </View>
            <ShareCodePanel shareCode={game.shareCode} />
            <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
          </View>

          <View style={styles.banner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </View>

          <View style={styles.row}>
            <Button label="Undo" onPress={() => void undo()} disabled={!localPlayerId} />
            <Button
              label="Reset"
              onPress={() =>
                void applyGame(
                  (g) => {
                    g.events = [];
                    g.status = 'InProgress';
                    return g;
                  },
                  { suppressWin: true },
                )
              }
            />
            {game.players.length < template.maxPlayers ? (
              <Button label="Add player" onPress={() => setAddingPlayer(true)} />
            ) : null}
            {!complete ? (
              <Button
                label="Mark complete"
                onPress={() =>
                  void applyGame((g) => {
                    g.status = 'Completed';
                    return g;
                  })
                }
              />
            ) : null}
            {isRounds && !complete && localPlayerId ? (
              <Button
                label="Add my score"
                variant="primary"
                onPress={() => {
                  setMyRoundScore('0');
                  setEnteringScore(true);
                }}
              />
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isInstant ? (
            <View style={styles.wrap}>
              {snapshot.standings.map((s) => {
                const isYou = s.playerId === localPlayerId;
                return (
                  <View
                    key={s.playerId}
                    style={[styles.scoreCard, isYou ? styles.scoreCardYou : styles.scoreCardOther]}
                  >
                    <Text style={styles.cardTitle}>
                      {s.playerName}
                      {isYou ? ' · you' : ''}
                    </Text>
                    <Text style={typography.score}>{s.total}</Text>
                    {isYou && !complete ? (
                      <View style={styles.row}>
                        <Pressable
                          style={styles.scoreBtn}
                          onPress={() => void adjust(s.playerId, -1)}
                        >
                          <Text style={styles.scoreBtnText}>−</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.scoreBtn, styles.scoreBtnPlus]}
                          onPress={() => void adjust(s.playerId, 1)}
                        >
                          <Text style={[styles.scoreBtnText, { color: colors.accentText }]}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {s.isLeader ? <Badge label="Leader" tone="accent" /> : null}
                    {s.isWinner ? <Badge label="Winner" tone="success" /> : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {snapshot.standings.map((s) => (
                <View
                  key={s.playerId}
                  style={[
                    styles.totalChip,
                    s.playerId === localPlayerId && styles.chipYou,
                  ]}
                >
                  <Text style={styles.cardTitle}>
                    {s.playerName}
                    {s.playerId === localPlayerId ? ' · you' : ''}
                  </Text>
                  <Text style={styles.chipTotal}>{s.total}</Text>
                  {s.isWinner ? <Badge label="Winner" tone="success" /> : null}
                </View>
              ))}
            </ScrollView>
          )}
        </ScrollView>

        {enteringScore && localPlayer ? (
          <View style={styles.roundPanel}>
            <Text style={styles.cardTitle}>
              Your score (round {nextRoundForPlayer(game, localPlayer.id)})
            </Text>
            <View style={styles.playerRow}>
              <Text style={[typography.label, { width: 120 }]}>{localPlayer.name}</Text>
              <Field
                style={{ flex: 1 }}
                value={myRoundScore}
                onChangeText={setMyRoundScore}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.row}>
              <Button label="Submit" variant="primary" onPress={() => void submitMyScore()} />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setEnteringScore(false);
                  setMyRoundScore('0');
                }}
              />
            </View>
          </View>
        ) : null}

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle={template.name}
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
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.lg, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 14,
    borderRadius: radii.md,
  },
  bannerText: {
    ...typography.label,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  scoreCard: {
    width: 168,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
  scoreCardYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  scoreCardOther: { borderColor: colors.border },
  cardTitle: {
    ...typography.label,
    fontSize: 15,
    textAlign: 'center',
  },
  scoreBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnPlus: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scoreBtnText: { color: colors.text, fontSize: 28, fontWeight: '700' },
  totalChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: radii.md,
    marginRight: 10,
    minWidth: 120,
    gap: 6,
  },
  chipYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipTotal: {
    ...typography.score,
    fontSize: 28,
  },
  roundPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: 10,
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

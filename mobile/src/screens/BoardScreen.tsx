import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { findLocalPlayerId, nextRoundForPlayer } from '../domain/localPlayer';
import { createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Board'>;

export function BoardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enteringScore, setEnteringScore] = useState(false);
  const [myRoundScore, setMyRoundScore] = useState('0');

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (next) => setGame(next),
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId]);

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
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const isInstant = template.scoringMode === 'Instant';
  const isRounds = template.scoringMode === 'Rounds';
  const complete = snapshot.isComplete;

  const applyGame = async (mutator: (g: Game) => Game) => {
    const next = mutator({
      ...game,
      players: [...game.players],
      events: [...game.events],
    });
    const snap = calculate(next, template);
    if (snap.isComplete) next.status = 'Completed';
    else if (next.status === 'Completed' && !snap.isComplete) next.status = 'InProgress';
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
    await applyGame((g) => {
      let removed = false;
      for (let i = g.events.length - 1; i >= 0; i--) {
        if (g.events[i].playerId === localPlayerId) {
          g.events.splice(i, 1);
          removed = true;
          break;
        }
      }
      if (!removed) setError('No scores of yours to undo.');
      return g;
    });
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{game.name}</Text>
            <Text style={styles.muted}>{template.name}</Text>
            <ShareCodePanel shareCode={game.shareCode} />
          </View>
          <Pressable style={styles.btn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.btnText}>Home</Text>
          </Pressable>
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={() => void undo()} disabled={!localPlayerId}>
            <Text style={styles.btnText}>Undo</Text>
          </Pressable>
          <Pressable
            style={styles.btn}
            onPress={() =>
              void applyGame((g) => {
                g.events = [];
                g.status = 'InProgress';
                return g;
              })
            }
          >
            <Text style={styles.btnText}>Reset</Text>
          </Pressable>
          {!complete ? (
            <Pressable
              style={styles.btn}
              onPress={() =>
                void applyGame((g) => {
                  g.status = 'Completed';
                  return g;
                })
              }
            >
              <Text style={styles.btnText}>Mark complete</Text>
            </Pressable>
          ) : null}
          {isRounds && !complete && localPlayerId ? (
            <Pressable
              style={[styles.btn, styles.accent]}
              onPress={() => {
                setMyRoundScore('0');
                setEnteringScore(true);
              }}
            >
              <Text style={styles.btnText}>Add my score</Text>
            </Pressable>
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
                  style={[styles.card, isYou ? styles.cardYou : styles.cardOther]}
                >
                  <Text style={styles.cardTitle}>
                    {s.playerName}
                    {isYou ? ' · you' : ''}
                  </Text>
                  <Text style={styles.score}>{s.total}</Text>
                  {isYou && !complete ? (
                    <View style={styles.row}>
                      <Pressable
                        style={styles.scoreBtn}
                        onPress={() => void adjust(s.playerId, -1)}
                      >
                        <Text style={styles.scoreBtnText}>−</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.scoreBtn, styles.accent]}
                        onPress={() => void adjust(s.playerId, 1)}
                      >
                        <Text style={styles.scoreBtnText}>+</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {s.isLeader ? <Text style={styles.muted}>Leader</Text> : null}
                  {s.isWinner ? <Text style={styles.muted}>Winner</Text> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View>
            <ScrollView horizontal>
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
                  <Text style={styles.bannerText}>Total: {s.total}</Text>
                  {s.isWinner ? <Text style={styles.muted}>Winner</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {enteringScore && localPlayer ? (
        <View style={styles.roundPanel}>
          <Text style={styles.cardTitle}>
            Your score (round {nextRoundForPlayer(game, localPlayer.id)})
          </Text>
          <View style={styles.playerRow}>
            <Text style={[styles.btnText, { width: 120 }]}>{localPlayer.name}</Text>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={myRoundScore}
              onChangeText={setMyRoundScore}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
          </View>
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.accent]} onPress={() => void submitMyScore()}>
              <Text style={styles.btnText}>Submit</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setEnteringScore(false);
                setMyRoundScore('0');
              }}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 24, gap: 10 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  muted: { color: colors.muted },
  banner: {
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: 8,
  },
  bannerText: { color: colors.text, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  accent: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  error: { color: colors.danger },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: 160,
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
  cardYou: { borderColor: colors.accent },
  cardOther: { borderColor: colors.border },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  score: { color: colors.text, fontSize: 40, fontWeight: '800' },
  scoreBtn: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnText: { color: colors.text, fontSize: 28, fontWeight: '700' },
  totalChip: {
    backgroundColor: colors.surfaceAlt,
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 110,
  },
  chipYou: { borderWidth: 2, borderColor: colors.accent },
  roundPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
});

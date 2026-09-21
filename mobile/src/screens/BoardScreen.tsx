import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createScoreEvent, type Game } from '../domain/models';
import { calculate, nextRoundNumber } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { loadGames, saveGame } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Board'>;

export function BoardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enteringRound, setEnteringRound] = useState(false);
  const [roundScores, setRoundScores] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const games = await loadGames();
    const found = games.find((g) => g.id === gameId) ?? null;
    setGame(found);
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );

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
    await applyGame((g) => {
      g.events.push(createScoreEvent(playerId, delta));
      return g;
    });
  };

  const undo = async () => {
    await applyGame((g) => {
      if (isRounds) {
        const lastRound = g.events
          .map((e) => e.roundNumber ?? 0)
          .reduce((m, n) => Math.max(m, n), 0);
        if (lastRound > 0) g.events = g.events.filter((e) => e.roundNumber !== lastRound);
        else g.events.pop();
      } else {
        g.events.pop();
      }
      return g;
    });
  };

  const submitRound = async () => {
    const scores: { playerId: string; points: number }[] = [];
    for (const player of game.players) {
      const raw = roundScores[player.id] ?? '0';
      const points = Number.parseInt(raw, 10);
      if (Number.isNaN(points)) {
        setError(`Invalid score for ${player.name}.`);
        return;
      }
      scores.push({ playerId: player.id, points });
    }
    const round = nextRoundNumber(game);
    await applyGame((g) => {
      for (const s of scores) g.events.push(createScoreEvent(s.playerId, s.points, round));
      return g;
    });
    setEnteringRound(false);
    setRoundScores({});
  };

  const banner = complete
    ? snapshot.winnerName
      ? `Winner: ${snapshot.winnerName}`
      : 'Game complete'
    : isInstant
      ? 'Tap +/− to update scores'
      : template.winCondition === 'FirstToTarget'
        ? `First to ${game.targetScore ?? template.defaultTargetScore} · Round ${snapshot.currentRound}`
        : template.winCondition === 'LowestTotal'
          ? `Round ${snapshot.currentRound} · Lowest wins`
          : `Round ${snapshot.currentRound} · Highest wins`;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{game.name}</Text>
            <Text style={styles.muted}>{template.name}</Text>
          </View>
          <Pressable style={styles.btn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.btnText}>Home</Text>
          </Pressable>
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Pressable style={styles.btn} onPress={() => void undo()}>
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
          {isRounds && !complete ? (
            <Pressable
              style={[styles.btn, styles.accent]}
              onPress={() => {
                const init: Record<string, string> = {};
                for (const p of game.players) init[p.id] = '0';
                setRoundScores(init);
                setEnteringRound(true);
              }}
            >
              <Text style={styles.btnText}>Add round</Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isInstant ? (
          <View style={styles.wrap}>
            {snapshot.standings.map((s) => (
              <View key={s.playerId} style={styles.card}>
                <Text style={styles.cardTitle}>{s.playerName}</Text>
                <Text style={styles.score}>{s.total}</Text>
                <View style={styles.row}>
                  <Pressable style={styles.scoreBtn} onPress={() => void adjust(s.playerId, -1)}>
                    <Text style={styles.scoreBtnText}>−</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.scoreBtn, styles.accent]}
                    onPress={() => void adjust(s.playerId, 1)}
                  >
                    <Text style={styles.scoreBtnText}>+</Text>
                  </Pressable>
                </View>
                {s.isLeader ? <Text style={styles.muted}>Leader</Text> : null}
                {s.isWinner ? <Text style={styles.muted}>Winner</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <View>
            <ScrollView horizontal>
              {snapshot.standings.map((s) => (
                <View key={s.playerId} style={styles.totalChip}>
                  <Text style={styles.cardTitle}>{s.playerName}</Text>
                  <Text style={styles.bannerText}>Total: {s.total}</Text>
                  {s.isWinner ? <Text style={styles.muted}>Winner</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {enteringRound ? (
        <View style={styles.roundPanel}>
          <Text style={styles.cardTitle}>Enter scores for this round</Text>
          {game.players.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <Text style={[styles.btnText, { width: 120 }]}>{p.name}</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={roundScores[p.id] ?? '0'}
                onChangeText={(text) => setRoundScores((s) => ({ ...s, [p.id]: text }))}
                keyboardType="number-pad"
                placeholderTextColor={colors.muted}
              />
            </View>
          ))}
          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.accent]} onPress={() => void submitRound()}>
              <Text style={styles.btnText}>Submit round</Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() => {
                setEnteringRound(false);
                setRoundScores({});
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
    borderColor: colors.accent,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
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

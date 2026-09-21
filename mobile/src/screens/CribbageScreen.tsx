import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CribbageBoard, type CribbagePegPlayer } from '../components/CribbageBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { loadGames, saveGame } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Cribbage'>;

const PEG_COLORS = ['#ece8dc', '#c4302b', '#2e6eb4'];
const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16];

export function CribbageScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const wasComplete = useRef(false);

  const load = useCallback(async () => {
    const games = await loadGames();
    const found = games.find((g) => g.id === gameId) ?? null;
    setGame(found);
    if (found && !selectedId) setSelectedId(found.players[0]?.id ?? null);
    if (found) {
      const template = getTemplate(found.templateId);
      if (template) wasComplete.current = calculate(found, template).isComplete;
    }
  }, [gameId, selectedId]);

  useEffect(() => {
    void load();
    // only on mount / gameId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const target = game?.targetScore ?? template?.defaultTargetScore ?? 121;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );

  const pegPlayers: CribbagePegPlayer[] = useMemo(() => {
    if (!game || !snapshot) return [];
    return game.players.map((player, i) => {
      const events = game.events.filter((e) => e.playerId === player.id);
      const total = events.reduce((s, e) => s + e.points, 0);
      const previous =
        events.length <= 1
          ? 0
          : events.slice(0, -1).reduce((s, e) => s + e.points, 0);
      return {
        id: player.id,
        name: player.name,
        total,
        frontPeg: Math.min(Math.max(total, 0), target),
        rearPeg: Math.min(Math.max(previous, 0), target),
        color: PEG_COLORS[i % PEG_COLORS.length],
        isWinner: snapshot.standings.some((s) => s.playerId === player.id && s.isWinner),
        isSelected: player.id === selectedId,
      };
    });
  }, [game, snapshot, selectedId, target]);

  const persist = async (next: Game, celebrate: boolean) => {
    await saveGame(next);
    setGame(next);
    if (celebrate) setShowCelebration(true);
  };

  const peg = async (points: number) => {
    if (!game || !template || !selectedId || snapshot?.isComplete) return;
    const selected = pegPlayers.find((p) => p.id === selectedId);
    if (!selected) return;

    let delta = points;
    if (selected.total + delta < 0) delta = -selected.total;
    if (delta === 0) return;

    const next: Game = {
      ...game,
      events: [...game.events, createScoreEvent(selectedId, delta)],
    };
    const snap = calculate(next, template);
    if (snap.isComplete) next.status = 'Completed';

    const shouldCelebrate =
      snap.isComplete && !wasComplete.current && snap.winnerName != null;
    wasComplete.current = snap.isComplete;

    try {
      await persist(next, shouldCelebrate);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Autosave failed');
    }
  };

  const undo = async () => {
    if (!game || !template || game.events.length === 0) return;
    const next: Game = { ...game, events: game.events.slice(0, -1) };
    const snap = calculate(next, template);
    next.status = snap.isComplete ? 'Completed' : 'InProgress';
    wasComplete.current = snap.isComplete;
    if (!snap.isComplete) setShowCelebration(false);
    await persist(next, false);
  };

  const reset = async () => {
    if (!game) return;
    const next: Game = { ...game, events: [], status: 'InProgress' };
    wasComplete.current = false;
    setShowCelebration(false);
    await persist(next, false);
  };

  if (!game || !template || !snapshot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const banner = snapshot.isComplete
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins!`
      : 'Game complete'
    : `Race to ${target} · Select a player and peg points`;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{game.name}</Text>
          <Text style={styles.muted}>Cribbage</Text>
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
          <Text style={styles.btnText}>Undo peg</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void reset()}>
          <Text style={styles.btnText}>Reset board</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.boardWrap}>
        <CribbageBoard players={pegPlayers} targetScore={target} />
      </View>

      <View style={styles.controls}>
        <Text style={styles.label}>Active pegger</Text>
        <View style={styles.row}>
          {pegPlayers.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.btn, p.isSelected && styles.accent]}
              onPress={() => setSelectedId(p.id)}
            >
              <View style={styles.pegger}>
                <View style={[styles.dot, { backgroundColor: p.color }]} />
                <Text style={styles.btnText}>
                  {p.name} ({p.total})
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Peg points</Text>
        <View style={styles.row}>
          {QUICK.map((n) => (
            <Pressable
              key={n}
              style={[styles.pegBtn, styles.accent]}
              onPress={() => void peg(n)}
              disabled={snapshot.isComplete}
            >
              <Text style={styles.btnText}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {showCelebration ? (
        <FireworksOverlay
          winnerName={snapshot.winnerName}
          onDismiss={() => setShowCelebration(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 12, gap: 8 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
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
  boardWrap: { flex: 1, minHeight: 180 },
  controls: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  label: { color: colors.text, fontWeight: '700' },
  pegger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  pegBtn: {
    width: 48,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

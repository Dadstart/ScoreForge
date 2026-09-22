import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CribbageBoard, type CribbagePegPlayer } from '../components/CribbageBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import { findLocalPlayerId } from '../domain/localPlayer';
import { createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Cribbage'>;

const PEG_COLORS = ['#ece8dc', '#c4302b', '#2e6eb4'];
const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16];

export function CribbageScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const wasComplete = useRef(false);

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
          if (tmpl) {
            const complete = calculate(found, tmpl).isComplete;
            if (complete && !wasComplete.current) {
              const snap = calculate(found, tmpl);
              if (snap.winnerName) setShowCelebration(true);
            }
            wasComplete.current = complete;
          }
        }
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const target = game?.targetScore ?? template?.defaultTargetScore ?? 121;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );

  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName) : null),
    [game, displayName],
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
        isSelected: player.id === localPlayerId,
      };
    });
  }, [game, snapshot, localPlayerId, target]);

  const localPlayer = pegPlayers.find((p) => p.id === localPlayerId) ?? null;

  const persist = async (next: Game, celebrate: boolean) => {
    await saveGame(next);
    if (celebrate) setShowCelebration(true);
  };

  const peg = async (points: number) => {
    if (!game || !template || !localPlayerId || !localPlayer || snapshot?.isComplete) return;

    let delta = points;
    if (localPlayer.total + delta < 0) delta = -localPlayer.total;
    if (delta === 0) return;

    const next: Game = {
      ...game,
      events: [...game.events, createScoreEvent(localPlayerId, delta)],
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
    if (!game || !template || !localPlayerId || game.events.length === 0) return;
    const last = game.events[game.events.length - 1];
    if (last.playerId !== localPlayerId) {
      setError('You can only undo your own last peg.');
      return;
    }
    const next: Game = { ...game, events: game.events.slice(0, -1) };
    const snap = calculate(next, template);
    next.status = snap.isComplete ? 'Completed' : 'InProgress';
    wasComplete.current = snap.isComplete;
    if (!snap.isComplete) setShowCelebration(false);
    setError(null);
    await persist(next, false);
  };

  const reset = async () => {
    if (!game) return;
    const next: Game = { ...game, events: [], status: 'InProgress' };
    wasComplete.current = false;
    setShowCelebration(false);
    setError(null);
    await persist(next, false);
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

  const canPeg = localPlayerId != null && !snapshot.isComplete;
  const banner = snapshot.isComplete
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins!`
      : 'Game complete'
    : localPlayer
      ? `Race to ${target} · Pegging as ${localPlayer.name}`
      : `Race to ${target} · Set your display name (Join) to match a player before pegging`;

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
            <Badge label="Cribbage" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Button label="Undo peg" onPress={() => void undo()} disabled={!localPlayerId} />
          <Button label="Reset board" onPress={() => void reset()} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.boardWrap}>
          <CribbageBoard players={pegPlayers} targetScore={target} />
        </View>

        <View style={styles.controls}>
          <Text style={typography.section}>Players</Text>
          <View style={styles.row}>
            {pegPlayers.map((p) => (
              <View
                key={p.id}
                style={[styles.playerChip, p.id === localPlayerId && styles.playerChipYou]}
              >
                <View style={styles.pegger}>
                  <View style={[styles.dot, { backgroundColor: p.color }]} />
                  <Text style={typography.label}>
                    {p.name} ({p.total})
                    {p.id === localPlayerId ? ' · you' : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={[typography.section, { marginTop: 4 }]}>Peg your points</Text>
          <View style={styles.row}>
            {QUICK.map((n) => (
              <Pressable
                key={n}
                style={[styles.pegBtn, !canPeg && styles.disabled]}
                onPress={() => void peg(n)}
                disabled={!canPeg}
              >
                <Text style={styles.pegBtnText}>{n}</Text>
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
    </Screen>
  );
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
  },
  bannerText: { ...typography.label, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
  boardWrap: { flex: 1, minHeight: 180 },
  controls: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 8,
  },
  playerChip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  playerChipYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  pegger: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  pegBtn: {
    width: 48,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  pegBtnText: {
    color: colors.accentText,
    fontWeight: '800',
    fontSize: 15,
  },
  disabled: { opacity: 0.35 },
});

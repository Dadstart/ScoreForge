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
import { AddPlayerModal } from '../components/AddPlayerModal';
import { CribbageBoard, type CribbagePegPlayer } from '../components/CribbageBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { GameBanner, GameError, GameHeader } from '../components/GameChrome';
import { Button, Screen } from '../components/ui';
import { useLiveGame } from '../hooks/useLiveGame';
import { playModeOf, createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { usePlaySpark } from '../hooks/usePlaySpark';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Cribbage'>;

const PEG_COLORS = ['#ece8dc', '#c4302b', '#2e6eb4'];
const QUICK = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 16];

export function CribbageScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    commit,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(gameId);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const { sparks, spark } = usePlaySpark();
  const target = game?.targetScore ?? template?.defaultTargetScore ?? 121;
  const seenPegs = useRef<number | null>(null);
  useEffect(() => {
    if (!game) return;
    const count = game.events.length;
    const last = game.events[count - 1];
    if (seenPegs.current == null) {
      seenPegs.current = count;
      return;
    }
    if (count > seenPegs.current && last && last.points > 0) spark(`+${last.points}`, 'gold');
    seenPegs.current = count;
  }, [game, spark]);

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

  const peg = (points: number) => {
    if (!template || !localPlayerId || !localPlayer || snapshot?.isComplete) return;
    let delta = points;
    if (localPlayer.total + delta < 0) delta = -localPlayer.total;
    if (delta === 0) return;
    setError(null);
    commit((current) => {
      const next: Game = {
        ...current,
        events: [...current.events, createScoreEvent(localPlayerId, delta)],
      };
      const snap = calculate(next, template);
      if (snap.isComplete) next.status = 'Completed';
      noteLocalResult(snap);
      return next;
    }, false);
  };

  const undo = () => {
    if (!template || !localPlayerId) return;
    beginSuppress();
    setError(null);
    let finished = false;
    try {
      const moved = commit((current) => {
        const last = current.events[current.events.length - 1];
        if (!last || last.playerId !== localPlayerId) return null;
        const next: Game = { ...current, events: current.events.slice(0, -1) };
        const snap = calculate(next, template);
        next.status = snap.isComplete ? 'Completed' : 'InProgress';
        finished = snap.isComplete;
        noteLocalResult(snap);
        return next;
      }, false);
      if (!moved) setError('You can only undo your own last peg.');
    } finally {
      endSuppress(finished);
    }
  };

  const reset = () => {
    if (!template) return;
    beginSuppress();
    setError(null);
    try {
      commit((current) => {
        const next: Game = { ...current, events: [], status: 'InProgress' };
        noteLocalResult(calculate(next, template));
        return next;
      }, false);
    } finally {
      endSuppress(false);
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
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <GameHeader
          name={game.name}
          badge="Cribbage"
          templateId="cribbage"
          shareCode={game.shareCode}
          passAndPlay={playModeOf(game) === 'pass-and-play'}
          onHome={() => navigation.navigate('Home')}
        />

        <GameBanner title={banner} />

        <View style={styles.row}>
          <Button label="Undo peg" onPress={() => void undo()} disabled={!localPlayerId} />
          <Button label="Reset board" onPress={() => void reset()} />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
        </View>

        <GameError message={error} />

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

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Cribbage"
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.md, gap: 8 },
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
  boardWrap: { minHeight: 180 },
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

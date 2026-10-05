import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { TriPeaksBoard } from '../components/TriPeaksBoard';
import { Button, Screen } from '../components/ui';
import type { Game } from '../domain/models';
import {
  cardAt,
  clearedCount,
  createTriPeaksState,
  drawStock,
  ensureTriPeaksState,
  hasMove,
  hint,
  play,
  undo,
  type Spot,
  type TriPeaksState,
} from '../domain/tripeaks';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TriPeaks'>;

export function TriPeaksScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const saving = useRef(false);
  const serverGame = useRef<Game | null>(null);
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame((current) => {
          if (!found) return null;
          if (saving.current && current && found.revision <= current.revision) return current;
          serverGame.current = found;
          return preferNewerGame(current, found);
        });
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

  useEffect(() => {
    if (!game) return;
    const next = ensureTriPeaksState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deal the cards');
      });
  }, [game]);

  const tripeaks = game?.tripeaks ?? null;
  const moveKey = `${tripeaks?.moves ?? 0}|${tripeaks?.won ?? false}|${tripeaks?.lastAction ?? ''}`;
  useEffect(() => {
    setHintText(null);
    setConfirmDeal(false);
  }, [moveKey]);

  const persist = async (next: Game, celebrate: boolean) => {
    if (!template || saving.current) return;
    saving.current = true;
    setGame(next);
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      const saved = await saveGame(next);
      serverGame.current = saved;
      setGame((current) => preferNewerGame(current, saved));
      setError(null);
    } catch (err) {
      if (serverGame.current) setGame(serverGame.current);
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

  if (!game || !template || !snapshot || !tripeaks) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const player = game.players[0];
  const cleared = clearedCount(tripeaks);
  const peaks = tripeaks.rows[0]?.filter((card) => card == null).length ?? 0;
  const stuck = !tripeaks.won && !hasMove(tripeaks);
  const banner = tripeaks.won
    ? `${player?.name ?? 'You'} wins`
    : stuck
      ? 'No moves left'
      : `${cleared} of 28 · streak ${tripeaks.streak} · ${pointsLabel(tripeaks.score)}`;

  const apply = async (nextTriPeaks: TriPeaksState) => {
    const next: Game = {
      ...game,
      tripeaks: nextTriPeaks,
      status: nextTriPeaks.won ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onCard = (spot: Spot) => {
    if (tripeaks.won) return;
    const next = play(tripeaks, spot);
    if (next) {
      void apply(next);
      return;
    }
    const face = cardAt(tripeaks, spot);
    if (face) setHintText(`The ${face.name} is not one away from the waste`);
  };

  const onStock = () => {
    if (tripeaks.won) return;
    const next = drawStock(tripeaks);
    if (next) void apply(next);
  };

  const onUndo = () => {
    const next = undo(tripeaks);
    if (next) void apply(next);
  };

  const onDeal = async () => {
    if (!tripeaks.won && tripeaks.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    const next: Game = {
      ...game,
      tripeaks: createTriPeaksState(),
      status: 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    beginSuppress();
    setConfirmDeal(false);
    try {
      noteLocalResult(calculate(next, template));
      await persist(next, false);
    } finally {
      endSuppress(false);
    }
  };

  return (
    <Screen>
      <View
        style={[
          styles.screen,
          { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={typography.title}>{game.name}</Text>
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {tripeaks.lastAction ? <Text style={styles.action}>{tripeaks.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <TriPeaksBoard
              state={tripeaks}
              disabled={tripeaks.won}
              onCard={onCard}
              onStock={onStock}
            />
            <Text style={styles.hint}>
              Tap an uncovered card one rank above or below the waste. Aces and kings do not meet.
              A run scores 1, then 2, then 3. Drawing starts the run over. Clearing a peak adds 15.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={typography.label}>
              {player?.name ?? 'You'} · {pointsLabel(tripeaks.score)}
            </Text>
            <Text style={typography.body}>
              {tripeaks.won
                ? 'The peaks are clear. Deal again to play another.'
                : `${cleared} of 28 cards cleared. ${peaks} of 3 peaks cleared.`}
            </Text>
            <View style={styles.actions}>
              <Button label="Undo" disabled={tripeaks.undo.length === 0} onPress={onUndo} />
              <Button label="Hint" onPress={() => setHintText(hint(tripeaks))} />
              <Button
                label={confirmDeal ? 'Confirm deal' : 'New deal'}
                onPress={() => void onDeal()}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="TriPeaks"
            onDismiss={dismissCelebration}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function pointsLabel(score: number): string {
  return `${score} ${score === 1 ? 'point' : 'points'}`;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: space.md, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  titleBlock: { flex: 1, gap: 4 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 12,
    borderRadius: radii.md,
    gap: 4,
  },
  bannerText: { ...typography.label, fontSize: 15 },
  action: { ...typography.body, color: colors.text },
  wide: { flexDirection: 'row', gap: 16, paddingBottom: 24, alignItems: 'flex-start' },
  stack: { gap: 12, paddingBottom: 28 },
  boardPane: { gap: 8, width: '100%' },
  boardPaneWide: { flex: 1.4, minWidth: 360 },
  hint: { ...typography.body, fontSize: 13 },
  panel: {
    flex: 1,
    minWidth: 240,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

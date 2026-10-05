import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PyramidBoard } from '../components/PyramidBoard';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Button, Screen } from '../components/ui';
import type { Game } from '../domain/models';
import {
  clearedCount,
  createPyramidState,
  drawStock,
  ensurePyramidState,
  hasMove,
  hint,
  isFree,
  play,
  sameSpot,
  undo,
  type PyramidState,
  type Spot,
} from '../domain/pyramid';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Pyramid'>;

export function PyramidScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Spot | null>(null);
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
    const next = ensurePyramidState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deal the cards');
      });
  }, [game]);

  const pyramid = game?.pyramid ?? null;
  const moveKey = `${pyramid?.moves ?? 0}|${pyramid?.won ?? false}|${pyramid?.lastAction ?? ''}`;
  useEffect(() => {
    setSelection(null);
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

  if (!game || !template || !snapshot || !pyramid) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const player = game.players[0];
  const cleared = clearedCount(pyramid);
  const stuck = !pyramid.won && !hasMove(pyramid);
  const banner = pyramid.won
    ? `${player?.name ?? 'You'} wins`
    : stuck
      ? 'No moves left'
      : `${cleared} of 28 · ${pyramid.moves} ${pyramid.moves === 1 ? 'move' : 'moves'}`;

  const apply = async (nextPyramid: PyramidState) => {
    const next: Game = {
      ...game,
      pyramid: nextPyramid,
      status: nextPyramid.won ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onSpot = (spot: Spot) => {
    if (pyramid.won || !isFree(pyramid, spot)) return;
    const face = faceRank(pyramid, spot);
    if (face === 13) {
      const removed = play(pyramid, spot);
      if (removed) void apply(removed);
      return;
    }
    if (selection && !sameSpot(selection, spot)) {
      const paired = play(pyramid, selection, spot);
      if (paired) {
        void apply(paired);
        return;
      }
    }
    if (selection && sameSpot(selection, spot)) {
      setSelection(null);
      return;
    }
    setSelection(spot);
  };

  const onStock = () => {
    if (pyramid.won) return;
    const next = drawStock(pyramid);
    if (next) void apply(next);
  };

  const onUndo = () => {
    const next = undo(pyramid);
    if (next) void apply(next);
  };

  const onDeal = async () => {
    if (!pyramid.won && pyramid.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    const next: Game = {
      ...game,
      pyramid: createPyramidState(),
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
          {pyramid.lastAction ? <Text style={styles.action}>{pyramid.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <PyramidBoard
              state={pyramid}
              selection={selection}
              disabled={pyramid.won}
              onSpot={onSpot}
              onStock={onStock}
            />
            <Text style={styles.hint}>
              Tap a king to remove it. Tap two uncovered cards that add to 13. Aces are 1 and jacks are 11.
              Draw one card from the stock.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={typography.label}>
              {player?.name ?? 'You'} · {cleared} cleared
            </Text>
            <Text style={typography.body}>
              {pyramid.won
                ? 'The pyramid is clear. Deal again to play another.'
                : 'Only a card with nothing on it can be played. The stock can be turned when it runs out.'}
            </Text>
            <View style={styles.actions}>
              <Button label="Undo" disabled={pyramid.undo.length === 0} onPress={onUndo} />
              <Button label="Hint" onPress={() => setHintText(hint(pyramid))} />
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
            subtitle="Pyramid"
            onDismiss={dismissCelebration}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function faceRank(state: PyramidState, spot: Spot): number | null {
  const code = spot.pile === 'waste' ? state.waste[state.waste.length - 1] : state.rows[spot.row]?.[spot.index];
  if (!code) return null;
  const rank = 'A23456789TJQK'.indexOf(code[0].toUpperCase()) + 1;
  return rank > 0 ? rank : null;
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

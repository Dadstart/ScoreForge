import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { SpiderBoard } from '../components/SpiderBoard';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen, usePageScroll } from '../components/ui';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import {
  completedCount,
  createSpiderState,
  dealStock,
  ensureSpiderState,
  hasMove,
  hint,
  play,
  runFrom,
  undo,
  type SpiderSource,
  type SpiderState,
  type SuitCount,
} from '../domain/spider';
import { getTemplate } from '../domain/templates';
import { usePlaySpark } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Spider'>;

export function SpiderScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<SpiderSource | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const [dragging, setDragging] = useState(false);
  usePageScroll(!dragging);
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
  const { sparks, spark } = usePlaySpark();

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
    const next = ensureSpiderState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deal the cards');
      });
  }, [game]);

  const spider = game?.spider ?? null;
  const moveKey = `${spider?.moves ?? 0}|${spider?.won ?? false}|${spider?.lastAction ?? ''}`;
  const priorSpider = useRef<SpiderState | null>(null);
  useEffect(() => {
    setSelection(null);
    setHintText(null);
    setConfirmDeal(false);
  }, [moveKey]);
  useEffect(() => {
    const prior = priorSpider.current;
    priorSpider.current = spider;
    if (!prior || !spider) return;
    const added = spider.completed.length - prior.completed.length;
    if (added === 1) spark('Suit!', 'gold');
    else if (added > 1) spark(`${added} suits`, 'gold');
  }, [spider, spark]);

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

  if (!game || !template || !snapshot || !spider) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const player = game.players[0];
  const home = completedCount(spider);
  const stuck = !spider.won && !hasMove(spider);
  const banner = spider.won
    ? `${player?.name ?? 'You'} wins`
    : stuck
      ? 'No moves left'
      : `${home} of 8 · ${spider.moves} ${spider.moves === 1 ? 'move' : 'moves'}`;

  const apply = async (nextSpider: SpiderState) => {
    const next: Game = {
      ...game,
      spider: nextSpider,
      status: nextSpider.won ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onColumn = (column: number, at: number) => {
    if (spider.won) return;
    if (selection && selection.column === column && selection.at === at) {
      setSelection(null);
      return;
    }
    if (selection) {
      const moved = play(spider, selection, column);
      if (moved) {
        void apply(moved);
        return;
      }
    }
    if (at >= 0 && runFrom(spider, column, at)) setSelection({ column, at });
    else setSelection(null);
  };

  const onDrop = (source: SpiderSource, column: number) => {
    if (spider.won) return false;
    const moved = play(spider, source, column);
    if (!moved) return false;
    void apply(moved);
    return true;
  };

  const onStock = () => {
    if (spider.won) return;
    const next = dealStock(spider);
    if (next) void apply(next);
  };

  const onUndo = () => {
    const next = undo(spider);
    if (next) void apply(next);
  };

  const onDeal = async () => {
    if (!spider.won && spider.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    const next: Game = {
      ...game,
      spider: createSpiderState(spider.suits),
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
            <Badge label={suitLabel(spider.suits)} tone="accent" />
          </View>
          <GameHelp templateId="spider" />
          <ShareCodePanel shareCode={game.shareCode} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {spider.lastAction ? <Text style={styles.action}>{spider.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <SpiderBoard
              state={spider}
              selection={selection}
              disabled={spider.won}
              onColumn={onColumn}
              onStock={onStock}
              onDrop={onDrop}
              onDragChange={setDragging}
            />
            <Text style={styles.hint}>
              Drag a same-suit run onto a card one rank higher, of any suit. An empty column takes any run.
              Deal a row only when every column has a card. A finished suit leaves the table.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={typography.label}>
              {player?.name ?? 'You'} · {home} of 8 suits
            </Text>
            <Text style={typography.body}>
              {spider.won
                ? 'All eight suits are home. Deal again to play another.'
                : 'Build down. Only a same-suit sequence moves together. Kings through aces of one suit are removed.'}
            </Text>
            <View style={styles.actions}>
              <Button label="Undo" disabled={spider.undo.length === 0} onPress={onUndo} />
              <Button label="Hint" onPress={() => setHintText(hint(spider))} />
              <Button label={confirmDeal ? 'Confirm deal' : 'New deal'} onPress={() => void onDeal()} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Spider" onDismiss={dismissCelebration} />
        ) : null}
      </View>
    </Screen>
  );
}

function suitLabel(suits: SuitCount): string {
  if (suits === 1) return '1 suit';
  if (suits === 2) return '2 suits';
  return '4 suits';
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

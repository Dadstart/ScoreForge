import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { FreecellBoard } from '../components/FreecellBoard';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import {
  buildFoundation,
  canFinish,
  createFreecellState,
  destinations,
  ensureFreecellState,
  finish,
  foundationCount,
  hasMove,
  hint,
  play,
  undo,
  type Dest,
  type FreecellState,
  type Source,
} from '../domain/freecell';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Freecell'>;

export function FreecellScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Source | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const [dragging, setDragging] = useState(false);
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
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );

  useEffect(() => {
    if (snapshot) onSnapshot(snapshot);
  }, [snapshot, onSnapshot]);

  useEffect(() => {
    if (!game) return;
    const next = ensureFreecellState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deal the cards');
      });
  }, [game]);

  const freecell = game?.freecell ?? null;
  const moveKey = `${freecell?.deal ?? 0}|${freecell?.moves ?? 0}|${freecell?.won ?? false}|${freecell?.lastAction ?? ''}`;
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

  if (!game || !template || !snapshot || !freecell) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const player = game.players[0];
  const home = foundationCount(freecell);
  const stuck = !freecell.won && !hasMove(freecell);
  const banner = freecell.won
    ? `${player?.name ?? 'You'} wins`
    : stuck
      ? 'No moves left'
      : `${home} of 52 · ${freecell.moves} ${freecell.moves === 1 ? 'move' : 'moves'}`;

  const apply = async (nextFreecell: FreecellState) => {
    const next: Game = {
      ...game,
      freecell: nextFreecell,
      status: nextFreecell.won ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const tryMove = (source: Source | null, dest: Dest | null) => {
    if (!source || !dest || freecell.won) return false;
    const next = play(freecell, source, dest);
    if (!next) return false;
    void apply(next);
    return true;
  };

  const onCell = (index: number) => {
    const dest: Dest = { pile: 'cell', index };
    if (tryMove(selection, dest)) return;
    if (selection?.pile === 'cell' && selection.index === index) {
      const built = buildFoundation(freecell, selection);
      if (built) {
        void apply(built);
        return;
      }
    }
    setSelection(freecell.cells[index] ? { pile: 'cell', index } : null);
  };

  const onFoundation = (index: number) => {
    const dest: Dest = { pile: 'foundation', index };
    if (tryMove(selection, dest)) return;
    const pile = freecell.foundations[index] ?? [];
    setSelection(pile.length > 0 ? { pile: 'foundation', index } : null);
  };

  const onTableau = (index: number, at: number) => {
    const dest: Dest = { pile: 'tableau', index };
    if (tryMove(selection, dest)) return;
    if (selection?.pile === 'tableau' && selection.index === index && selection.at === at) {
      const built = buildFoundation(freecell, selection);
      if (built) {
        void apply(built);
        return;
      }
    }
    if (at < 0) {
      setSelection(null);
      return;
    }
    const source: Source = { pile: 'tableau', index, at };
    setSelection(destinations(freecell, source).length > 0 ? source : null);
  };

  const onUndo = () => {
    const next = undo(freecell);
    if (next) void apply(next);
  };

  const onFinish = () => {
    const next = finish(freecell);
    if (next) void apply(next);
  };

  const onDeal = async () => {
    if (!freecell.won && freecell.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    const next: Game = {
      ...game,
      freecell: createFreecellState(),
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
          { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label={`Deal ${freecell.deal}`} tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {freecell.lastAction ? <Text style={styles.action}>{freecell.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <ScrollView scrollEnabled={!dragging} contentContainerStyle={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <FreecellBoard
              state={freecell}
              selection={selection}
              disabled={freecell.won}
              onCell={onCell}
              onFoundation={onFoundation}
              onTableau={onTableau}
              onDrop={(source, dest) => tryMove(source, dest)}
              onDragChange={setDragging}
            />
            <Text style={styles.hint}>
              Drag a card onto a column, a free cell, or a foundation. Tap it, then tap again, to build it up. A run
              moves together when the free cells have room.
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={typography.label}>
              {player?.name ?? 'You'} · {home} on the foundations
            </Text>
            <Text style={typography.body}>
              {freecell.won
                ? 'All 52 cards are home. Deal again to play another.'
                : 'The share code opens this same deal on another device signed in with your name.'}
            </Text>
            <View style={styles.actions}>
              <Button label="Undo" disabled={freecell.undo.length === 0} onPress={onUndo} />
              <Button label="Hint" onPress={() => setHintText(hint(freecell))} />
              {canFinish(freecell) ? <Button label="Finish" variant="primary" onPress={onFinish} /> : null}
              <Button label={confirmDeal ? 'Confirm deal' : 'New deal'} onPress={() => void onDeal()} />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        {showCelebration ? (
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Freecell" onDismiss={dismissCelebration} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.md, gap: 8 },
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

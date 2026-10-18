import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { FreecellBoard } from '../components/FreecellBoard';
import { PlaySpark } from '../components/PlaySpark';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen, usePageScroll } from '../components/ui';
import {
  buildFoundation,
  canFinish,
  createFreecellState,
  destinations,
  ensureFreecellState,
  finish,
  hasMove,
  hint,
  homeCount,
  play,
  undo,
  type Dest,
  type FreecellState,
  type Source,
} from '../domain/freecell';
import { cardFace } from '../domain/klondike';
import { playModeOf, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Freecell'>;

export function FreecellScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const {
    game,
    template,
    snapshot,
    error,
    persist,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(route.params.gameId, {
    repair: ensureFreecellState,
    repairError: 'Could not deal the cards',
    optimistic: true,
  });
  const [selection, setSelection] = useState<Source | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const [dragging, setDragging] = useState(false);
  usePageScroll(!dragging);
  const { sparks, spark } = usePlaySpark();

  const freecell = game?.freecell ?? null;
  const moveKey = `${freecell?.moves ?? 0}|${freecell?.won ?? false}|${freecell?.lastAction ?? ''}`;
  const priorFreecell = useRef<FreecellState | null>(null);
  useEffect(() => {
    setSelection(null);
    setHintText(null);
    setConfirmDeal(false);
  }, [moveKey]);
  useEffect(() => {
    const prior = priorFreecell.current;
    priorFreecell.current = freecell;
    if (!prior || !freecell) return;
    const cheer = foundationCheer(prior, freecell);
    if (cheer) spark(cheer.label, cheer.tone);
  }, [freecell, spark]);

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
  const home = homeCount(freecell);
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
    const source: Source = { pile: 'cell', index };
    if (selection && sameSource(selection, source)) {
      const built = buildFoundation(freecell, source);
      if (built) {
        void apply(built);
        return;
      }
    }
    setSelection(freecell.cells[index] && destinations(freecell, source).length > 0 ? source : null);
  };

  const onFoundation = (index: number) => {
    const dest: Dest = { pile: 'foundation', index };
    if (tryMove(selection, dest)) return;
    const source: Source = { pile: 'foundation', index };
    if (selection && sameSource(selection, source)) {
      const built = buildFoundation(freecell, source);
      if (built) void apply(built);
      return;
    }
    const pile = freecell.foundations[index] ?? [];
    setSelection(pile.length > 0 && destinations(freecell, source).length > 0 ? source : null);
  };

  const onCascade = (index: number, at: number) => {
    const dest: Dest = { pile: 'cascade', index };
    if (tryMove(selection, dest)) return;
    if (at < 0) {
      setSelection(null);
      return;
    }
    const source: Source = { pile: 'cascade', index, at };
    if (selection && sameSource(selection, source)) {
      const built = buildFoundation(freecell, source);
      if (built) {
        void apply(built);
        return;
      }
    }
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
          { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="FreeCell" tone="accent" />
          </View>
          <GameHelp templateId="freecell" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={playModeOf(game) === 'pass-and-play'} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {freecell.lastAction ? <Text style={styles.action}>{freecell.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <FreecellBoard
              state={freecell}
              selection={selection}
              disabled={freecell.won}
              onCell={onCell}
              onFoundation={onFoundation}
              onCascade={onCascade}
              onDrop={(source, dest) => tryMove(source, dest)}
              onDragChange={setDragging}
            />
            <Text style={styles.hint}>
              Drag a card to a column, a free cell, or a foundation. Tap a card again to build it up.
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
        </View>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="FreeCell"
            onDismiss={dismissCelebration}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function foundationCheer(before: FreecellState, after: FreecellState): { label: string; tone: 'gold' } | null {
  const gained = homeCount(after) - homeCount(before);
  if (gained <= 0) return null;
  if (gained > 1) return { label: `+${gained}`, tone: 'gold' };
  for (let index = 0; index < 4; index++) {
    const previous = before.foundations[index]?.length ?? 0;
    const nextLength = after.foundations[index]?.length ?? 0;
    if (nextLength <= previous) continue;
    const face = cardFace(after.foundations[index]?.[nextLength - 1] ?? '');
    if (!face) return { label: 'Home', tone: 'gold' };
    if (face.rank === 13) return { label: 'Suit!', tone: 'gold' };
    const word = face.name.split(' ')[0] ?? 'Home';
    return { label: word.charAt(0).toUpperCase() + word.slice(1), tone: 'gold' };
  }
  return { label: 'Home', tone: 'gold' };
}

function sameSource(left: Source, right: Source): boolean {
  if (left.pile !== right.pile || left.index !== right.index) return false;
  if (left.pile === 'cascade' && right.pile === 'cascade') return left.at === right.at;
  return true;
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

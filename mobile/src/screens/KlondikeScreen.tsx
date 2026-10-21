import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { KlondikeBoard } from '../components/KlondikeBoard';
import { PlaySpark } from '../components/PlaySpark';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen, usePageScroll } from '../components/ui';
import {
  buildFoundation,
  canFinish,
  cardFace,
  createKlondikeState,
  drawStock,
  ensureKlondikeState,
  finish,
  foundationCount,
  hasMove,
  hint,
  play,
  undo,
  type Dest,
  type KlondikeState,
  type Source,
} from '../domain/klondike';
import { playModeOf } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Klondike'>;

export function KlondikeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const {
    game,
    template,
    snapshot,
    error,
    commit,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(route.params.gameId, {
    repair: ensureKlondikeState,
    repairError: 'Could not deal the cards',
    optimistic: true,
  });
  const [selection, setSelection] = useState<Source | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const [dragging, setDragging] = useState(false);
  usePageScroll(!dragging);
  const { sparks, spark } = usePlaySpark();

  const klondike = game?.klondike ?? null;
  const moveKey = `${klondike?.moves ?? 0}|${klondike?.won ?? false}|${klondike?.lastAction ?? ''}`;
  const priorKlondike = useRef<KlondikeState | null>(null);
  useEffect(() => {
    setSelection(null);
    setHintText(null);
    setConfirmDeal(false);
  }, [moveKey]);
  useEffect(() => {
    const prior = priorKlondike.current;
    priorKlondike.current = klondike;
    if (!prior || !klondike) return;
    const cheer = foundationCheer(prior, klondike);
    if (cheer) spark(cheer.label, cheer.tone);
  }, [klondike, spark]);

  if (!game || !template || !snapshot || !klondike) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const player = game.players[0];
  const home = foundationCount(klondike);
  const stuck = !klondike.won && !hasMove(klondike);
  const banner = klondike.won
    ? `${player?.name ?? 'You'} wins`
    : stuck
      ? 'No moves left'
      : `${home} of 52 · ${klondike.moves} ${klondike.moves === 1 ? 'move' : 'moves'}`;

  const apply = (change: (board: KlondikeState) => KlondikeState | null) =>
    commit((current) => {
      const board = current.klondike;
      if (!board) return null;
      const next = change(board);
      if (!next) return null;
      return {
        ...current,
        klondike: next,
        status: next.won ? 'Completed' : 'InProgress',
        updatedAt: new Date().toISOString(),
      };
    }, (next) => Boolean(next.klondike?.won));

  const tryMove = (source: Source | null, dest: Dest | null) => {
    if (!source || !dest) return false;
    return apply((board) => (board.won ? null : play(board, source, dest)));
  };

  const onStock = () => {
    apply((board) => (board.won ? null : drawStock(board)));
  };

  const onWaste = () => {
    const source: Source = { pile: 'waste' };
    if (selection?.pile === 'waste') {
      const built = apply((board) => buildFoundation(board, source));
      if (built) return;
    }
    setSelection(klondike.waste.length > 0 ? source : null);
  };

  const onFoundation = (index: number) => {
    const dest: Dest = { pile: 'foundation', index };
    if (tryMove(selection, dest)) return;
    const pile = klondike.foundations[index] ?? [];
    setSelection(pile.length > 0 ? { pile: 'foundation', index } : null);
  };

  const onTableau = (index: number, at: number) => {
    const dest: Dest = { pile: 'tableau', index };
    if (tryMove(selection, dest)) return;
    if (selection?.pile === 'tableau' && selection.index === index && selection.at === at) {
      if (apply((board) => buildFoundation(board, selection))) return;
    }
    if (at < 0) {
      setSelection(null);
      return;
    }
    const source: Source = { pile: 'tableau', index, at };
    setSelection(canPick(klondike, source) ? source : null);
  };

  const onUndo = () => {
    apply((board) => undo(board));
  };

  const onFinish = () => {
    apply((board) => finish(board));
  };

  const onDeal = () => {
    if (!klondike.won && klondike.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    beginSuppress();
    setConfirmDeal(false);
    try {
      commit((current) => {
        const next = {
          ...current,
          klondike: createKlondikeState(current.klondike?.drawCount === 3 ? 3 : 1),
          status: 'InProgress' as const,
          updatedAt: new Date().toISOString(),
        };
        noteLocalResult(calculate(next, template));
        return next;
      }, false);
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
            <Badge label={`Draw ${klondike.drawCount}`} tone="accent" />
          </View>
          <GameHelp templateId="klondike" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={playModeOf(game) === 'pass-and-play'} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {klondike.lastAction ? <Text style={styles.action}>{klondike.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <KlondikeBoard
              state={klondike}
              selection={selection}
              disabled={klondike.won}
              onStock={onStock}
              onWaste={onWaste}
              onFoundation={onFoundation}
              onTableau={onTableau}
              onDrop={(source, dest) => tryMove(source, dest)}
              onDragChange={setDragging}
            />
            <Text style={styles.hint}>
              Drag a card onto a column or foundation. Tap it, then tap again, to build it up.
              {klondike.drawCount === 3 ? ' Draw three. Only the top waste card plays.' : ' Draw one.'}
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={typography.label}>
              {player?.name ?? 'You'} · {home} on the foundations
            </Text>
            <Text style={typography.body}>
              {klondike.won
                ? 'All 52 cards are home. Deal again to play another.'
                : 'The share code opens this same deal on another device signed in with your name.'}
            </Text>
            <View style={styles.actions}>
              <Button label="Undo" disabled={klondike.undo.length === 0} onPress={onUndo} />
              <Button label="Hint" onPress={() => setHintText(hint(klondike))} />
              {canFinish(klondike) ? (
                <Button label="Finish" variant="primary" onPress={onFinish} />
              ) : null}
              <Button
                label={confirmDeal ? 'Confirm deal' : 'New deal'}
                onPress={() => void onDeal()}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Klondike"
            onDismiss={dismissCelebration}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function foundationCheer(
  before: KlondikeState,
  after: KlondikeState,
): { label: string; tone: 'gold' } | null {
  const gained = foundationCount(after) - foundationCount(before);
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

function canPick(state: KlondikeState, source: Source): boolean {
  if (source.pile !== 'tableau') return false;
  const pile = state.tableau[source.index] ?? [];
  const run = pile.slice(source.at);
  if (run.length === 0) return false;
  for (let index = 0; index < 4; index++) {
    if (play(state, source, { pile: 'foundation', index })) return true;
  }
  for (let index = 0; index < 7; index++) {
    if (index === source.index) continue;
    if (play(state, source, { pile: 'tableau', index })) return true;
  }
  return false;
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

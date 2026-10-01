import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { KlondikeBoard } from '../components/KlondikeBoard';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import {
  buildFoundation,
  canFinish,
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
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Klondike'>;

export function KlondikeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Source | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [confirmDeal, setConfirmDeal] = useState(false);
  const saving = useRef(false);
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
        setGame((current) => (found ? preferNewerGame(current, found) : null));
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
    const next = ensureKlondikeState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not deal the cards');
      });
  }, [game]);

  const klondike = game?.klondike ?? null;
  const moveKey = `${klondike?.moves ?? 0}|${klondike?.won ?? false}|${klondike?.lastAction ?? ''}`;
  useEffect(() => {
    setSelection(null);
    setHintText(null);
    setConfirmDeal(false);
  }, [moveKey]);

  const persist = async (next: Game, celebrate: boolean) => {
    if (!template || saving.current) return;
    saving.current = true;
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      const saved = await saveGame(next);
      setGame((current) => preferNewerGame(current, saved));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

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

  const apply = async (nextKlondike: KlondikeState) => {
    const next: Game = {
      ...game,
      klondike: nextKlondike,
      status: nextKlondike.won ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const tryMove = (source: Source | null, dest: Dest | null) => {
    if (!source || !dest || klondike.won) return false;
    const next = play(klondike, source, dest);
    if (!next) return false;
    void apply(next);
    return true;
  };

  const onStock = () => {
    if (klondike.won) return;
    const next = drawStock(klondike);
    if (next) void apply(next);
  };

  const onWaste = () => {
    const source: Source = { pile: 'waste' };
    if (selection?.pile === 'waste') {
      const built = buildFoundation(klondike, source);
      if (built) {
        void apply(built);
        return;
      }
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
      const built = buildFoundation(klondike, selection);
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
    setSelection(canPick(klondike, source) ? source : null);
  };

  const onUndo = () => {
    const next = undo(klondike);
    if (next) void apply(next);
  };

  const onFinish = () => {
    const next = finish(klondike);
    if (next) void apply(next);
  };

  const onDeal = async () => {
    if (!klondike.won && klondike.moves > 0 && !confirmDeal) {
      setConfirmDeal(true);
      return;
    }
    const next: Game = {
      ...game,
      klondike: createKlondikeState(klondike.drawCount),
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
            <Badge label={`Draw ${klondike.drawCount}`} tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {klondike.lastAction ? <Text style={styles.action}>{klondike.lastAction}</Text> : null}
          {hintText ? <Text style={styles.action}>{hintText}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <KlondikeBoard
              state={klondike}
              selection={selection}
              disabled={klondike.won}
              onStock={onStock}
              onWaste={onWaste}
              onFoundation={onFoundation}
              onTableau={onTableau}
            />
            <Text style={styles.hint}>
              Tap a card, then the column or foundation where it goes. Tap it again to build it up.
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
        </ScrollView>

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

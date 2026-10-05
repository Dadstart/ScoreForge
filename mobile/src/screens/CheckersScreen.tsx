import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { CheckersBoard } from '../components/CheckersBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import {
  CHECKERS_SIDES,
  answerDraw,
  createCheckersState,
  ensureCheckersState,
  legalHops,
  offerDraw,
  pieceAt,
  playHop,
  resign,
  setRequireJumps,
  type CheckersSquare,
  type CheckersState,
} from '../domain/checkers';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { usePlaySpark } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Checkers'>;

export function CheckersScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selection, setSelection] = useState<CheckersSquare | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const saving = useRef(false);
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
    void loadDisplayName().then(setDisplayName);
  }, []);

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
  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName) : null),
    [game, displayName],
  );

  useEffect(() => {
    if (!game) return;
    const next = ensureCheckersState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not set up the board');
      });
  }, [game]);

  const checkers = game?.checkers ?? null;
  const priorCheckers = useRef<CheckersState | null>(null);
  useEffect(() => {
    const prior = priorCheckers.current;
    priorCheckers.current = checkers;
    if (!prior || !checkers) return;
    const captured = prior.pieces.length - checkers.pieces.length;
    const crowned =
      checkers.pieces.filter((piece) => piece.kind === 'king').length -
      prior.pieces.filter((piece) => piece.kind === 'king').length;
    if (captured > 0) spark(captured > 1 ? `${captured} jumps` : 'Jump!', 'rose');
    else if (crowned > 0) spark('King!', 'gold');
  }, [checkers, spark]);
  const turnKey = checkers?.turn ?? null;
  const chainKey = checkers?.chain ? `${checkers.chain.row},${checkers.chain.col}` : '';
  const moveKey = checkers?.lastMove ? `${checkers.lastMove.toRow},${checkers.lastMove.toCol}` : '';
  useEffect(() => {
    setSelection(null);
    setConfirmReset(false);
    setConfirmResign(false);
  }, [turnKey, chainKey, moveKey, checkers?.winnerSide, checkers?.draw, checkers?.requireJumps]);

  const hops = useMemo(() => (checkers ? legalHops(checkers) : []), [checkers]);
  const origins = useMemo(() => {
    const seen = new Set<string>();
    const squares: CheckersSquare[] = [];
    for (const hop of hops) {
      const key = `${hop.fromRow},${hop.fromCol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      squares.push({ row: hop.fromRow, col: hop.fromCol });
    }
    return squares;
  }, [hops]);
  const selected = checkers?.chain ?? selection ?? (origins.length === 1 ? origins[0] : null);

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

  if (!game || !template || !snapshot || !checkers) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const finished = Boolean(checkers.winnerSide || checkers.draw || snapshot.isComplete);
  const currentSide = CHECKERS_SIDES[checkers.turn];
  const currentPlayer = game.players.find((player) => checkers.sides[player.id] === checkers.turn) ?? null;
  const yourTurn = currentPlayer?.id === localPlayerId;
  const localSide = localPlayerId ? checkers.sides[localPlayerId] : undefined;
  const winnerSide = checkers.winnerSide ? CHECKERS_SIDES[checkers.winnerSide] : null;
  const winnerPlayer = checkers.winnerSide
    ? game.players.find((player) => checkers.sides[player.id] === checkers.winnerSide)
    : null;
  const jumpsRequired = checkers.requireJumps !== false;
  const mustJump = jumpsRequired && hops.some((hop) => hop.captureRow != null);

  const actor = yourTurn ? 'Your turn' : currentPlayer ? `${currentPlayer.name}'s turn` : null;
  const turnLine = actor ? `${actor} · ${currentSide.name}` : `${currentSide.name}'s turn`;
  const banner = checkers.draw
    ? 'Draw'
    : winnerSide
      ? `${winnerPlayer?.name ?? winnerSide.name} wins`
      : checkers.chain
        ? `${currentPlayer?.name ?? currentSide.name} must keep jumping`
        : `${turnLine}${mustJump ? ' · a jump is required' : ''}`;

  const apply = async (nextCheckers: typeof checkers) => {
    const next: Game = {
      ...game,
      checkers: nextCheckers,
      status: nextCheckers.winnerSide || nextCheckers.draw ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const playBetween = (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    if (finished || saving.current) return false;
    const hop = hops.find(
      (candidate) =>
        candidate.fromRow === fromRow &&
        candidate.fromCol === fromCol &&
        candidate.toRow === toRow &&
        candidate.toCol === toCol,
    );
    if (!hop) return false;
    const next = playHop(checkers, game.players, hop);
    if (!next) {
      setError('That move is no longer legal.');
      return false;
    }
    void apply(next);
    return true;
  };

  const onSquare = (row: number, col: number) => {
    if (finished || saving.current) return;
    if (selected && playBetween(selected.row, selected.col, row, col)) return;
    const piece = pieceAt(checkers.pieces, row, col);
    if (
      piece &&
      piece.side === checkers.turn &&
      hops.some((hop) => hop.fromRow === row && hop.fromCol === col)
    ) {
      setSelection({ row, col });
      return;
    }
    if (!checkers.chain) setSelection(null);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      checkers: createCheckersState(game.players, { requireJumps: checkers.requireJumps }),
      events: [],
      status: 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    beginSuppress();
    setConfirmReset(false);
    try {
      noteLocalResult(calculate(next, template));
      await persist(next, false);
    } finally {
      endSuppress(false);
    }
  };

  const onRequireJumps = async (requireJumps: boolean) => {
    const nextCheckers = setRequireJumps(checkers, requireJumps);
    if (!nextCheckers) return;
    const next: Game = {
      ...game,
      checkers: nextCheckers,
      updatedAt: new Date().toISOString(),
    };
    await persist(next, false);
  };

  const onResign = async () => {
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }
    const next = resign(checkers, game.players);
    setConfirmResign(false);
    if (next) await apply(next);
  };

  const applyResult = async (nextCheckers: CheckersState | null) => {
    if (!nextCheckers) return;
    await apply(nextCheckers);
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
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Checkers" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {checkers.lastAction ? <Text style={styles.action}>{checkers.lastAction}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <CheckersBoard
              pieces={checkers.pieces}
              hops={finished ? [] : hops}
              selected={selected}
              lastMove={checkers.lastMove}
              flip={localSide === 'light'}
              disabled={finished}
              onSquare={onSquare}
              onDrop={playBetween}
            />
            <Text style={styles.hint}>
              Drag a piece onto a highlighted square, or tap the piece and then the square.{' '}
              {jumpsRequired
                ? 'Jumps are required, and a crowned piece keeps jumping.'
                : 'Jumps are optional. A piece that jumps still keeps jumping.'}
              {localSide ? ` Your ${CHECKERS_SIDES[localSide].name} pieces sit at the bottom.` : ' Black sits at the bottom.'}
            </Text>
          </View>

          <View style={styles.panel}>
            <Text style={[typography.section, styles.section]}>Jumps</Text>
            <View style={styles.actions}>
              <Button
                label="Required"
                variant={jumpsRequired ? 'primary' : 'secondary'}
                onPress={() => void onRequireJumps(true)}
              />
              <Button
                label="Optional"
                variant={jumpsRequired ? 'secondary' : 'primary'}
                onPress={() => void onRequireJumps(false)}
              />
            </View>

            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.playerRow}>
              {game.players.map((player) => {
                const sideId = checkers.sides[player.id];
                const side = sideId ? CHECKERS_SIDES[sideId] : null;
                const left = sideId ? checkers.pieces.filter((piece) => piece.side === sideId).length : 0;
                const active = sideId === checkers.turn && !finished;
                return (
                  <View key={player.id} style={[styles.playerChip, active && styles.playerChipActive]}>
                    <View style={[styles.dot, { backgroundColor: side?.fill ?? colors.muted }]} />
                    <Text style={typography.label}>
                      {player.name}
                      {player.id === localPlayerId ? ' · you' : ''}
                      {side ? ` · ${side.name}` : ''} · {left} left
                    </Text>
                  </View>
                );
              })}
            </View>

            {finished ? (
              <Text style={typography.body}>
                {checkers.draw ? 'Both sides agreed to a draw.' : 'Reset the board to play again.'}
              </Text>
            ) : (
              <Text style={typography.body}>
                {game.players.length < 2
                  ? 'Share the code for Red. Either phone can play the color whose turn it is.'
                  : 'Either phone can play the color whose turn it is.'}
              </Text>
            )}

            {!finished ? (
              <View style={styles.actions}>
                {!checkers.chain && checkers.drawOffer ? (
                  <>
                    <Button
                      label="Accept draw"
                      variant="primary"
                      onPress={() => void applyResult(answerDraw(checkers, game.players, true))}
                    />
                    <Button
                      label="Decline"
                      onPress={() => void applyResult(answerDraw(checkers, game.players, false))}
                    />
                  </>
                ) : null}
                {!checkers.chain && !checkers.drawOffer ? (
                  <Button label="Offer draw" onPress={() => void applyResult(offerDraw(checkers, game.players))} />
                ) : null}
                <Button
                  label={confirmResign ? 'Confirm resign' : 'Resign'}
                  variant="danger"
                  onPress={() => void onResign()}
                />
              </View>
            ) : null}

            <View style={styles.actions}>
              <Button label={confirmReset ? 'Confirm reset' : 'Reset board'} onPress={() => void onReset()} />
              {game.players.length < template.maxPlayers ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </View>

        <PlaySpark sparks={sparks} />
        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Checkers"
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
    gap: 4,
  },
  bannerText: { ...typography.label, fontSize: 15 },
  action: { ...typography.body, color: colors.text },
  wide: { flexDirection: 'row', gap: 16, paddingBottom: 24, alignItems: 'flex-start' },
  stack: { gap: 12, paddingBottom: 28 },
  boardPane: { gap: 8, width: '100%' },
  boardPaneWide: { flex: 1.2, minWidth: 360 },
  hint: { ...typography.body, fontSize: 13 },
  panel: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 10,
  },
  section: { marginTop: 4 },
  playerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  playerChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.borderStrong },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

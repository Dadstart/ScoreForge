import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { ChessBoard } from '../components/ChessBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import {
  CHESS_SIDES,
  PIECE_GLYPH,
  answerDraw,
  checkedKing,
  createChessState,
  ensureChessState,
  legalMoves,
  lostPieces,
  offerDraw,
  oppositeSide,
  pieceAt,
  playMove,
  resign,
  type ChessSquare,
  type ChessState,
  type PromotionKind,
} from '../domain/chess';
import { deviceMayAct } from '../domain/localPlayer';
import { playModeOf, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { useLiveGame } from '../hooks/useLiveGame';
import { usePlaySpark } from '../hooks/usePlaySpark';
import type { RootStackParamList } from '../navigation/types';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chess'>;

type PendingPromotion = { fromRow: number; fromCol: number; toRow: number; toCol: number };

const PROMOTIONS: readonly PromotionKind[] = ['queen', 'rook', 'bishop', 'knight'];
const PROMOTION_NAME: Record<PromotionKind, string> = {
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

export function ChessScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    saving,
    persist,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(route.params.gameId, {
    repair: ensureChessState,
    repairError: 'Could not set up the board',
  });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [selection, setSelection] = useState<ChessSquare | null>(null);
  const [pending, setPending] = useState<PendingPromotion | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const { sparks, spark } = usePlaySpark();

  const chess = game?.chess ?? null;
  const priorChess = useRef<ChessState | null>(null);
  useEffect(() => {
    const prior = priorChess.current;
    priorChess.current = chess;
    if (!prior || !chess?.lastMove) return;
    const same =
      prior.lastMove?.fromRow === chess.lastMove.fromRow &&
      prior.lastMove?.fromCol === chess.lastMove.fromCol &&
      prior.lastMove?.toRow === chess.lastMove.toRow &&
      prior.lastMove?.toCol === chess.lastMove.toCol &&
      prior.turn === chess.turn;
    if (same) return;
    if (chess.winnerSide) spark('Checkmate', 'gold');
    else if (chess.lastMove.castle) spark('Castle', 'gold');
    else if (chess.lastMove.promotion) spark('Promote', 'gold');
    else if (chess.lastMove.capture) spark('Capture', 'rose');
    else if (checkedKing(chess)) spark('Check', 'gold');
  }, [chess, spark]);

  const turnKey = chess?.turn ?? null;
  const moveKey = chess?.lastMove ? `${chess.lastMove.fromRow},${chess.lastMove.fromCol},${chess.lastMove.toRow},${chess.lastMove.toCol}` : '';
  useEffect(() => {
    setSelection(null);
    setPending(null);
    setConfirmReset(false);
    setConfirmResign(false);
  }, [turnKey, moveKey, chess?.winnerSide, chess?.draw]);

  const moves = useMemo(() => (chess ? legalMoves(chess) : []), [chess]);
  const origins = useMemo(() => {
    const seen = new Set<string>();
    const squares: ChessSquare[] = [];
    for (const move of moves) {
      const key = `${move.fromRow},${move.fromCol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      squares.push({ row: move.fromRow, col: move.fromCol });
    }
    return squares;
  }, [moves]);
  const selected = pending
    ? { row: pending.fromRow, col: pending.fromCol }
    : (selection ?? (origins.length === 1 ? origins[0] : null));

  if (!game || !template || !snapshot || !chess) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const finished = Boolean(chess.winnerSide || chess.draw || snapshot.isComplete);
  const currentSide = CHESS_SIDES[chess.turn];
  const currentPlayer = game.players.find((player) => chess.sides[player.id] === chess.turn) ?? null;
  const yourTurn = currentPlayer?.id === localPlayerId;
  const canAct = !finished && deviceMayAct(game, localPlayerId, currentPlayer?.id ?? null);
  const drawOffer = chess.drawOffer;
  const drawResponderId = drawOffer
    ? (game.players.find((player) => chess.sides[player.id] === oppositeSide(drawOffer))?.id ?? null)
    : null;
  const canAnswerDraw = deviceMayAct(game, localPlayerId, drawResponderId);
  const localSide = localPlayerId ? chess.sides[localPlayerId] : undefined;
  const winnerSide = chess.winnerSide ? CHESS_SIDES[chess.winnerSide] : null;
  const winnerPlayer = chess.winnerSide
    ? game.players.find((player) => chess.sides[player.id] === chess.winnerSide)
    : null;
  const inCheck = !finished && checkedKing(chess) != null;

  const actor = yourTurn ? 'Your turn' : currentPlayer ? `${currentPlayer.name}'s turn` : null;
  const turnLine = actor ? `${actor} · ${currentSide.name}` : `${currentSide.name} to move`;
  const banner = chess.draw
    ? 'Draw'
    : winnerSide
      ? `${winnerPlayer?.name ?? winnerSide.name} wins`
      : `${turnLine}${inCheck ? ' · check' : ''}`;

  const apply = async (nextChess: typeof chess) => {
    const next: Game = {
      ...game,
      chess: nextChess,
      status: nextChess.winnerSide || nextChess.draw ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const commit = (fromRow: number, fromCol: number, toRow: number, toCol: number, promotion: PromotionKind | null) => {
    const next = playMove(chess, game.players, { fromRow, fromCol, toRow, toCol, promotion });
    if (!next) {
      setError('That move is no longer legal.');
      return false;
    }
    setPending(null);
    void apply(next);
    return true;
  };

  const playBetween = (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    if (!canAct || saving.current) return false;
    const options = moves.filter(
      (move) => move.fromRow === fromRow && move.fromCol === fromCol && move.toRow === toRow && move.toCol === toCol,
    );
    if (options.length === 0) return false;
    if (options.some((move) => move.promotion)) {
      setPending({ fromRow, fromCol, toRow, toCol });
      setSelection({ row: fromRow, col: fromCol });
      return true;
    }
    return commit(fromRow, fromCol, toRow, toCol, null);
  };

  const onSquare = (row: number, col: number) => {
    if (!canAct || saving.current) return;
    if (selected && playBetween(selected.row, selected.col, row, col)) return;
    const piece = pieceAt(chess.pieces, row, col);
    if (piece && piece.side === chess.turn && moves.some((move) => move.fromRow === row && move.fromCol === col)) {
      setSelection({ row, col });
      setPending(null);
      return;
    }
    setSelection(null);
    setPending(null);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      chess: createChessState(game.players),
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

  const onResign = async () => {
    if (!confirmResign) {
      setConfirmResign(true);
      return;
    }
    const next = resign(chess, game.players);
    setConfirmResign(false);
    if (next) await apply(next);
  };

  const applyResult = async (nextChess: ChessState | null) => {
    if (!nextChess) return;
    await apply(nextChess);
  };

  return (
    <Screen>
      <View style={[styles.screen, { paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Chess" tone="accent" />
          </View>
          <GameHelp templateId="chess" />
          <ShareCodePanel shareCode={game.shareCode} passAndPlay={playModeOf(game) === 'pass-and-play'} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {chess.lastAction ? <Text style={styles.action}>{chess.lastAction}</Text> : null}
        </View>

        <View style={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <ChessBoard
              pieces={chess.pieces}
              moves={canAct ? moves : []}
              selected={selected}
              lastMove={chess.lastMove}
              check={checkedKing(chess)}
              flip={localSide === 'black'}
              disabled={!canAct}
              onSquare={onSquare}
              onDrop={playBetween}
            />
            <Text style={styles.hint}>
              Drag a piece onto a highlighted square, or tap the piece and then the square. A pawn that reaches the
              last rank asks what it becomes.
              {localSide
                ? ` Your ${CHESS_SIDES[localSide].name} pieces sit at the bottom.`
                : ' White sits at the bottom.'}
              {playModeOf(game) === 'pass-and-play'
                ? ' Pass the phone when the color changes.'
                : ' Only the phone seated as the current color can move.'}
            </Text>
          </View>

          <View style={styles.panel}>
            {pending && canAct ? (
              <>
                <Text style={typography.section}>Promote the pawn</Text>
                <View style={styles.actions}>
                  {PROMOTIONS.map((kind) => (
                    <Button
                      key={kind}
                      label={`${PIECE_GLYPH[kind]} ${PROMOTION_NAME[kind]}`}
                      variant={kind === 'queen' ? 'primary' : 'secondary'}
                      onPress={() => commit(pending.fromRow, pending.fromCol, pending.toRow, pending.toCol, kind)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.playerRow}>
              {game.players.map((player) => {
                const sideId = chess.sides[player.id];
                const side = sideId ? CHESS_SIDES[sideId] : null;
                const captured = sideId ? lostPieces(chess, oppositeSide(sideId)) : [];
                const active = sideId === chess.turn && !finished;
                return (
                  <View key={player.id} style={[styles.playerChip, active && styles.playerChipActive]}>
                    <View style={[styles.dot, { backgroundColor: side?.fill ?? colors.muted }]} />
                    <Text style={typography.label}>
                      {player.name}
                      {player.id === localPlayerId ? ' · you' : ''}
                      {side ? ` · ${side.name}` : ''}
                    </Text>
                    {captured.length > 0 ? (
                      <Text style={[styles.captured, { color: sideId ? CHESS_SIDES[oppositeSide(sideId)].fill : colors.text }]}>
                        {captured.map((kind) => PIECE_GLYPH[kind]).join('')}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {finished ? (
              <Text style={typography.body}>
                {chess.draw ? 'The game is a draw. Reset the board to play again.' : 'Reset the board to play again.'}
              </Text>
            ) : (
              <Text style={typography.body}>
                {playModeOf(game) === 'pass-and-play'
                  ? 'Pass the phone for the color whose turn it is.'
                  : game.players.length < 2
                    ? 'Share the code for Black. Each phone moves only its own color.'
                    : 'Each phone moves only its own color.'}
              </Text>
            )}

            {!finished && (canAct || canAnswerDraw) ? (
              <View style={styles.actions}>
                {chess.drawOffer && canAnswerDraw ? (
                  <>
                    <Button
                      label="Accept draw"
                      variant="primary"
                      onPress={() => void applyResult(answerDraw(chess, game.players, true))}
                    />
                    <Button label="Decline" onPress={() => void applyResult(answerDraw(chess, game.players, false))} />
                  </>
                ) : null}
                {canAct && !chess.drawOffer ? (
                  <Button label="Offer draw" onPress={() => void applyResult(offerDraw(chess, game.players))} />
                ) : null}
                {canAct ? (
                  <Button
                    label={confirmResign ? 'Confirm resign' : 'Resign'}
                    variant="danger"
                    onPress={() => void onResign()}
                  />
                ) : null}
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
          <FireworksOverlay winnerName={snapshot.winnerName} subtitle="Chess" onDismiss={dismissCelebration} />
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
  captured: { fontSize: 16, letterSpacing: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

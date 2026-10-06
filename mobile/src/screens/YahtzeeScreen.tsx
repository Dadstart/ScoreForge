import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { YahtzeeDice } from '../components/YahtzeeDice';
import { YahtzeeScoreboard } from '../components/YahtzeeScoreboard';
import { Badge, Button, Screen } from '../components/ui';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game, ScoreEvent } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import {
  boxById,
  buildPlayerCard,
  createYahtzeeState,
  ensureYahtzeeState,
  isScorecardComplete,
  rollDice,
  scoreDice,
  scoreForBox,
  scorePreview,
  toggleHold,
  undoYahtzee,
  UPPER_BONUS,
  UPPER_BONUS_AT,
  YAHTZEE_BONUS_BOX,
  YAHTZEE_BOXES,
  yahtzeeBonusCount,
  type YahtzeeBox,
} from '../domain/yahtzee';
import { usePlaySpark, type SparkTone } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import type { RootStackParamList } from '../navigation/types';
import { loadDisplayName } from '../storage/displayNameStore';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Yahtzee'>;

export function YahtzeeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [scratch, setScratch] = useState<{ boxId: string; label: string } | null>(null);
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
  const seenScores = useRef<ScoreEvent[] | null>(null);
  useEffect(() => {
    if (!game) return;
    const prior = seenScores.current;
    seenScores.current = game.events;
    if (!prior || game.events.length <= prior.length) return;
    const priorIds = new Set(prior.map((event) => event.id));
    const scored = [...game.events]
      .reverse()
      .find((event) => !priorIds.has(event.id) && event.box && event.box !== YAHTZEE_BONUS_BOX);
    if (!scored?.box) return;
    const box = boxById(scored.box);
    if (!box) return;
    const cheer = yahtzeeCheer(box, scored.points, prior, game.events, scored.playerId);
    if (cheer) spark(cheer.label, cheer.tone);
  }, [game, spark]);

  useEffect(() => {
    if (!game) return;
    const next = ensureYahtzeeState(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Could not start the turn');
      });
  }, [game]);
  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName) : null),
    [game, displayName],
  );

  const cards = useMemo(() => {
    if (!game || !snapshot) return [];
    return game.players.map((player) => {
      const standing = snapshot.standings.find((row) => row.playerId === player.id);
      return buildPlayerCard(game.events, player, {
        isYou: player.id === localPlayerId,
        isWinner: standing?.isWinner ?? false,
        isLeader: standing?.isLeader ?? false,
      });
    });
  }, [game, snapshot, localPlayerId]);

  const persist = async (next: Game) => {
    const saved = await saveGame(next);
    setGame((current) => preferNewerGame(current, saved));
  };

  const applyGame = async (
    mutator: (current: Game) => Game,
    opts?: { suppressWin?: boolean; forceComplete?: boolean },
  ) => {
    if (!game || !template) return;
    const next = mutator({
      ...game,
      players: [...game.players],
      events: [...game.events],
    });
    next.status =
      opts?.forceComplete || isScorecardComplete(next) ? 'Completed' : 'InProgress';
    const snap = calculate(next, template);
    if (opts?.suppressWin || !snap.isComplete) {
      beginSuppress();
      try {
        noteLocalResult(snap);
        await persist(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Autosave failed');
      } finally {
        endSuppress(snap.isComplete);
      }
      return;
    }
    try {
      noteLocalResult(snap);
      await persist(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Autosave failed');
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

  const locked = snapshot.isComplete;
  const board = ensureYahtzeeState(game).yahtzee ?? null;
  const turnName = game.players.find((player) => player.id === board?.turn.playerId)?.name ?? 'Player';
  const preview = board?.turn.dice ? scorePreview(board.turn.dice, game.events, board.turn.playerId) : null;
  const banner = locked
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins with ${snapshot.standings.find((row) => row.isWinner)?.total ?? 0}`
      : 'Card complete'
    : turnBanner(turnName, board?.turn.dice ?? null, board?.turn.rollsLeft ?? 3);

  const scoreBox = (boxId: string) => {
    setScratch(null);
    void applyGame((current) => {
      const base = ensureYahtzeeState(current);
      if (!base.yahtzee) return current;
      const scored = scoreDice(base.yahtzee, base.events, base.players, boxId);
      if (!scored) return current;
      return { ...base, yahtzee: scored.state, events: scored.events };
    });
  };

  return (
    <Screen>
      <View
        style={[
          styles.content,
          {
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 28),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Yahtzee" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        {!locked && board ? (
          <YahtzeeDice
            dice={board.turn.dice}
            held={board.turn.held}
            rollsLeft={board.turn.rollsLeft}
            offers={rollOffers(preview)}
            onScore={scoreBox}
            onRoll={() => {
              if (board.turn.rollsLeft <= 0) return;
              void applyGame((current) => {
                const base = ensureYahtzeeState(current);
                if (!base.yahtzee) return current;
                const rolled = rollDice(base.yahtzee);
                return rolled ? { ...base, yahtzee: rolled } : current;
              });
            }}
            onToggleHold={(index) => {
              if (!toggleHold(board, index)) return;
              void applyGame((current) => {
                const base = ensureYahtzeeState(current);
                if (!base.yahtzee) return current;
                const held = toggleHold(base.yahtzee, index);
                return held ? { ...base, yahtzee: held } : current;
              });
            }}
          />
        ) : null}

        <View style={styles.row}>
          <Button
            label="Undo"
            onPress={() => {
              void applyGame(
                (current) => {
                  if (!current.yahtzee) return current;
                  const undone = undoYahtzee(current.yahtzee, current.events);
                  if (!undone) return current;
                  return { ...current, yahtzee: undone.state, events: undone.events };
                },
                { suppressWin: true },
              );
            }}
            disabled={!game.events.some((event) => event.box && event.box !== YAHTZEE_BONUS_BOX)}
          />
          <Button
            label="Reset card"
            onPress={() =>
              void applyGame(
                (current) => ({
                  ...current,
                  events: [],
                  yahtzee: createYahtzeeState(current.players),
                  status: 'InProgress',
                }),
                { suppressWin: true },
              )
            }
          />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
          {!locked ? (
            <Button
              label="Mark complete"
              onPress={() => void applyGame((current) => current, { forceComplete: true })}
            />
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <YahtzeeScoreboard
          players={cards}
          locked={locked}
          activePlayerId={locked ? null : board?.turn.playerId}
          suggestions={preview && board ? { playerId: board.turn.playerId, scores: preview } : null}
          onPressBox={(_playerId, boxId) => {
            const points = preview?.[boxId];
            if (points == null) return;
            if (points === 0) {
              setScratch({ boxId, label: boxById(boxId)?.label ?? 'this box' });
              return;
            }
            scoreBox(boxId);
          }}
        />

        <Text style={styles.note}>
          Roll up to three times. Tap a die to keep it. Gold numbers are what this roll scores. Tap one to
          take it. A zero scratches that box. Upper bonus is {UPPER_BONUS} at {UPPER_BONUS_AT}. After a 50
          in Yahtzee, each extra Yahtzee adds 100. Highest total wins.
        </Text>
      </View>

      <Modal visible={scratch != null && !locked} transparent animationType="fade" onRequestClose={() => setScratch(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setScratch(null)} accessibilityLabel="Cancel scratch" />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Scratch {scratch?.label}?</Text>
            <Text style={typography.subtitle}>This roll scores 0 there.</Text>
            <View style={styles.sheetRow}>
              <Button label="Cancel" variant="ghost" onPress={() => setScratch(null)} />
              <Button
                label="Scratch"
                variant="danger"
                onPress={() => {
                  if (scratch) scoreBox(scratch.boxId);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <PlaySpark sparks={sparks} />
      {showCelebration ? (
        <FireworksOverlay
          winnerName={snapshot.winnerName}
          subtitle="Yahtzee"
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
    </Screen>
  );
}

function rollOffers(preview: Record<string, number | null> | null): { id: string; label: string; points: number }[] {
  if (!preview) return [];
  return YAHTZEE_BOXES.flatMap((box) => {
    const points = preview[box.id];
    return points != null && points > 0 ? [{ id: box.id, label: box.label, points }] : [];
  }).sort((left, right) => right.points - left.points || left.label.localeCompare(right.label));
}

function turnBanner(name: string, dice: readonly number[] | null, rollsLeft: number): string {
  if (!dice) return `${name}, roll the dice.`;
  if (isFive(dice)) {
    return rollsLeft > 0
      ? `${name} rolled a Yahtzee. Score it, or roll again.`
      : `${name} rolled a Yahtzee. Score it.`;
  }
  if (rollsLeft > 0) {
    const left = rollsLeft === 1 ? '1 roll left' : `${rollsLeft} rolls left`;
    return `${name} · ${left}. Keep dice, roll again, or take a score.`;
  }
  return `${name}, take a score.`;
}

function isFive(dice: readonly number[]): boolean {
  return dice.length === 5 && dice.every((face) => face === dice[0]);
}

function yahtzeeCheer(
  box: YahtzeeBox,
  points: number,
  before: ScoreEvent[],
  after: ScoreEvent[],
  playerId: string,
): { label: string; tone: SparkTone } | null {
  if (box.id === 'yahtzee' && points === 50) return { label: 'Yahtzee!', tone: 'gold' };
  if (yahtzeeBonusCount(after, playerId) > yahtzeeBonusCount(before, playerId)) {
    return { label: '+100', tone: 'gold' };
  }
  const upperBefore = upperSum(before, playerId);
  const upperAfter = upperSum(after, playerId);
  if (upperBefore < UPPER_BONUS_AT && upperAfter >= UPPER_BONUS_AT) return { label: 'Bonus!', tone: 'gold' };
  if (box.kind === 'fixed' && points > 0 && points === box.fixed) {
    if (box.id === 'fullHouse') return { label: 'Full house!', tone: 'gold' };
    if (box.id === 'smallStraight' || box.id === 'largeStraight') return { label: 'Straight!', tone: 'gold' };
  }
  if (box.kind === 'face' && box.face && points === box.face * 5) return { label: 'Five!', tone: 'gold' };
  return null;
}

function upperSum(events: ScoreEvent[], playerId: string): number {
  return YAHTZEE_BOXES.filter((box) => box.section === 'upper').reduce(
    (sum, box) => sum + (scoreForBox(events, playerId, box.id) ?? 0),
    0,
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.md, gap: 10 },
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
  note: { ...typography.body, fontSize: 13 },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    gap: 12,
  },
  sheetTitle: { ...typography.title, fontSize: 22 },
  sheetRow: { flexDirection: 'row', gap: 8 },
});

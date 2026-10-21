import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { GameBanner, GameHeader } from '../components/GameChrome';
import { Badge, Button, Field, Screen } from '../components/ui';
import { nextRoundForPlayer } from '../domain/localPlayer';
import { useLiveGame } from '../hooks/useLiveGame';
import { playModeOf, createScoreEvent, type Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { addPlayerToGame, preferNewerGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Board'>;

export function BoardScreen({ navigation, route }: Props) {
  const { gameId } = route.params;
  const {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    commit,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useLiveGame(gameId);
  const [enteringScore, setEnteringScore] = useState(false);
  const [myRoundScore, setMyRoundScore] = useState('0');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const localPlayer = game?.players.find((p) => p.id === localPlayerId) ?? null;

  if (!game || !template || !snapshot) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const isInstant = template.scoringMode === 'Instant';
  const isRounds = template.scoringMode === 'Rounds';
  const complete = snapshot.isComplete;

  const applyGame = (mutator: (g: Game) => Game, opts?: { suppressWin?: boolean }) => {
    let finished = false;
    const suppress = Boolean(opts?.suppressWin);
    if (suppress) beginSuppress();
    try {
      commit((current) => {
        const next = mutator({
          ...current,
          players: [...current.players],
          events: [...current.events],
        });
        const snap = calculate(next, template);
        if (snap.isComplete) next.status = 'Completed';
        else if (next.status === 'Completed' && !snap.isComplete) next.status = 'InProgress';
        finished = snap.isComplete;
        noteLocalResult(snap);
        return next;
      }, false);
    } finally {
      if (suppress) endSuppress(finished);
    }
  };

  const adjust = async (playerId: string, delta: number) => {
    if (!isInstant || complete) return;
    if (playerId !== localPlayerId) {
      setError('You can only change your own score.');
      return;
    }
    await applyGame((g) => {
      g.events.push(createScoreEvent(playerId, delta));
      return g;
    });
  };

  const undo = async () => {
    if (!localPlayerId) {
      setError('Set your display name to match a player before undoing.');
      return;
    }
    await applyGame(
      (g) => {
        for (let i = g.events.length - 1; i >= 0; i--) {
          if (g.events[i].playerId === localPlayerId) {
            g.events.splice(i, 1);
            break;
          }
        }
        return g;
      },
      { suppressWin: true },
    );
  };

  const submitMyScore = async () => {
    if (!localPlayerId || !localPlayer) {
      setError('Set your display name to match a player before scoring.');
      return;
    }
    const points = Number.parseInt(myRoundScore, 10);
    if (Number.isNaN(points)) {
      setError(`Invalid score for ${localPlayer.name}.`);
      return;
    }
    const round = nextRoundForPlayer(game, localPlayerId);
    await applyGame((g) => {
      g.events.push(createScoreEvent(localPlayerId, points, round));
      return g;
    });
    setEnteringScore(false);
    setMyRoundScore('0');
  };

  const banner = complete
    ? snapshot.winnerName
      ? `Winner: ${snapshot.winnerName}`
      : 'Game complete'
    : !localPlayer
      ? 'Set your display name (Join / Setup) to match a player before scoring'
      : isInstant
        ? `Scoring as ${localPlayer.name} · Tap +/− on your card`
        : template.winCondition === 'FirstToTarget'
          ? `First to ${game.targetScore ?? template.defaultTargetScore} · ${localPlayer.name}`
          : template.winCondition === 'LowestTotal'
            ? `${localPlayer.name} · Lowest wins`
            : `${localPlayer.name} · Highest wins`;

  return (
    <Screen>
      <View>
        <View style={styles.content}>
          <GameHeader
            name={game.name}
            badge={template.name}
            templateId={template.id}
            shareCode={game.shareCode}
            passAndPlay={playModeOf(game) === 'pass-and-play'}
            onHome={() => navigation.navigate('Home')}
          />

          <GameBanner title={banner} />

          <View style={styles.row}>
            <Button label="Undo" onPress={() => void undo()} disabled={!localPlayerId} />
            <Button
              label="Reset"
              onPress={() =>
                void applyGame(
                  (g) => {
                    g.events = [];
                    g.status = 'InProgress';
                    return g;
                  },
                  { suppressWin: true },
                )
              }
            />
            {game.players.length < template.maxPlayers ? (
              <Button label="Add player" onPress={() => setAddingPlayer(true)} />
            ) : null}
            {!complete ? (
              <Button
                label="Mark complete"
                onPress={() =>
                  void applyGame((g) => {
                    g.status = 'Completed';
                    return g;
                  })
                }
              />
            ) : null}
            {isRounds && !complete && localPlayerId ? (
              <Button
                label="Add my score"
                variant="primary"
                onPress={() => {
                  setMyRoundScore('0');
                  setEnteringScore(true);
                }}
              />
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {isInstant ? (
            <View style={styles.wrap}>
              {snapshot.standings.map((s) => {
                const isYou = s.playerId === localPlayerId;
                return (
                  <View
                    key={s.playerId}
                    style={[styles.scoreCard, isYou ? styles.scoreCardYou : styles.scoreCardOther]}
                  >
                    <Text style={styles.cardTitle}>
                      {s.playerName}
                      {isYou ? ' · you' : ''}
                    </Text>
                    <Text style={typography.score}>{s.total}</Text>
                    {isYou && !complete ? (
                      <View style={styles.row}>
                        <Pressable
                          style={styles.scoreBtn}
                          onPress={() => void adjust(s.playerId, -1)}
                        >
                          <Text style={styles.scoreBtnText}>−</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.scoreBtn, styles.scoreBtnPlus]}
                          onPress={() => void adjust(s.playerId, 1)}
                        >
                          <Text style={[styles.scoreBtnText, { color: colors.accentText }]}>+</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {s.isLeader ? <Badge label="Leader" tone="accent" /> : null}
                    {s.isWinner ? <Badge label="Winner" tone="success" /> : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {snapshot.standings.map((s) => (
                <View
                  key={s.playerId}
                  style={[
                    styles.totalChip,
                    s.playerId === localPlayerId && styles.chipYou,
                  ]}
                >
                  <Text style={styles.cardTitle}>
                    {s.playerName}
                    {s.playerId === localPlayerId ? ' · you' : ''}
                  </Text>
                  <Text style={styles.chipTotal}>{s.total}</Text>
                  {s.isWinner ? <Badge label="Winner" tone="success" /> : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {enteringScore && localPlayer ? (
          <View style={styles.roundPanel}>
            <Text style={styles.cardTitle}>
              Your score (round {nextRoundForPlayer(game, localPlayer.id)})
            </Text>
            <View style={styles.playerRow}>
              <Text style={[typography.label, { width: 120 }]}>{localPlayer.name}</Text>
              <Field
                style={{ flex: 1 }}
                value={myRoundScore}
                onChangeText={setMyRoundScore}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.row}>
              <Button label="Submit" variant="primary" onPress={() => void submitMyScore()} />
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => {
                  setEnteringScore(false);
                  setMyRoundScore('0');
                }}
              />
            </View>
          </View>
        ) : null}

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle={template.name}
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
  content: { padding: space.lg, paddingBottom: 24, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 14,
    borderRadius: radii.md,
  },
  bannerText: {
    ...typography.label,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  scoreCard: {
    width: 168,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
  scoreCardYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  scoreCardOther: { borderColor: colors.border },
  cardTitle: {
    ...typography.label,
    fontSize: 15,
    textAlign: 'center',
  },
  scoreBtn: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnPlus: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  scoreBtnText: { color: colors.text, fontSize: 28, fontWeight: '700' },
  totalChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: radii.md,
    marginRight: 10,
    minWidth: 120,
    gap: 6,
  },
  chipYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipTotal: {
    ...typography.score,
    fontSize: 28,
  },
  roundPanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: 10,
  },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { LifeBoard } from '../components/LifeBoard';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import {
  CHILD_VALUE,
  COLLEGE_TUITION,
  HOUSES,
  LIFE_COLORS,
  allRetired,
  chooseCareer,
  chooseCollege,
  chooseHouse,
  chooseRetirement,
  colorIndexFor,
  createLifeState,
  currentAction,
  ensureLifeState,
  formatCash,
  getCareer,
  getHouse,
  houseTrade,
  openStarterCareers,
  salaryOf,
  spin,
  type LifeAction,
  type PlayerLife,
} from '../domain/life';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useWinCelebration } from '../hooks/useWinCelebration';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Life'>;

export function LifeScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const wide = window.width >= 980;
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame(found);
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
    const next = ensureLifeState(game);
    if (next === game) return;
    void saveGame(next).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : 'Could not set up the board');
    });
  }, [game]);

  const persist = async (next: Game, celebrate: boolean) => {
    if (!template || saving.current) return;
    saving.current = true;
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      await saveGame(next);
      setGame(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

  if (!game || !template || !snapshot || !game.life) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const life = game.life;
  const current = game.players.find((player) => player.id === life.currentPlayerId) ?? null;
  const currentLife = current ? life.players[current.id] : undefined;
  const finished = allRetired(life, game.players) || snapshot.isComplete;
  const action = finished || !currentLife ? { kind: 'done' as const } : currentAction(life);
  const yourTurn = current?.id === localPlayerId;
  const winners = snapshot.standings.filter((standing) => standing.isWinner);

  const banner = finished
    ? winners.length > 1
      ? `Tie between ${winners.map((winner) => winner.playerName).join(' and ')}`
      : winners[0]
        ? `${winners[0].playerName} has the richest life`
        : 'Everyone has retired'
    : current && currentLife
      ? `${yourTurn ? 'Your turn' : `${current.name}'s turn`} · ${turnDetail(currentLife, action)}`
      : 'Waiting for a player';

  const apply = async (nextLife: typeof life) => {
    const next: Game = {
      ...game,
      life: nextLife,
      status: allRetired(nextLife, game.players) ? 'Completed' : 'InProgress',
      updatedAt: new Date().toISOString(),
    };
    await persist(next, true);
  };

  const onCollege = async () => {
    const next = chooseCollege(life, game.players);
    if (!next) return;
    await apply(next);
  };

  const onStarter = async () => {
    const next = openStarterCareers(life, game.players);
    if (!next) return;
    await apply(next);
  };

  const onCareer = async (careerId: string) => {
    const next = chooseCareer(life, game.players, careerId);
    if (!next) {
      setError('That career is no longer available.');
      return;
    }
    await apply(next);
  };

  const onHouse = async (houseId: string) => {
    const next = chooseHouse(life, game.players, houseId);
    if (!next) return;
    await apply(next);
  };

  const onRetire = async (path: 'estate' | 'country') => {
    const next = chooseRetirement(life, game.players, path);
    if (!next) return;
    await apply(next);
  };

  const onSpin = async () => {
    const next = spin(life, game.players);
    if (!next) return;
    await apply(next);
  };

  const onReset = async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    const next: Game = {
      ...game,
      life: createLifeState(game.players),
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

  return (
    <Screen>
      <View
        style={[
          styles.screen,
          {
            paddingTop: Math.max(insets.top, 10),
            paddingBottom: Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Life" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {life.lastAction ? <Text style={styles.action}>{life.lastAction}</Text> : null}
        </View>

        <ScrollView contentContainerStyle={wide ? styles.wide : styles.stack}>
          <View style={[styles.boardPane, wide && styles.boardPaneWide]}>
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.boardScroll}>
              <View style={styles.boardSizer}>
                <LifeBoard players={game.players} state={life} />
              </View>
            </ScrollView>
            <Text style={styles.hint}>
              Spin 1–10. Paydays pay even when you pass them. Life, family, and taxes count when you land.
              Wedding, house, career, degree, and retirement stop the move. College costs {formatCash(COLLEGE_TUITION)}.
              At the end, add the house and {formatCash(CHILD_VALUE)} for each child.
            </Text>
          </View>

          <View style={styles.panel}>
            {action.kind === 'done' ? (
              <Text style={typography.body}>Everyone has retired. Reset the board to play again.</Text>
            ) : null}

            {action.kind === 'college-or-career' ? (
              <View style={styles.choices}>
                <Choice
                  title="College"
                  meta={`Pay ${formatCash(COLLEGE_TUITION)} now. Degree careers pay more.`}
                  onPress={() => void onCollege()}
                />
                <Choice
                  title="Career"
                  meta="Skip college and start work on the main track."
                  onPress={() => void onStarter()}
                />
              </View>
            ) : null}

            {action.kind === 'career' ? (
              <View style={styles.choices}>
                {action.reason === 'change' && currentLife?.careerId ? (
                  <Choice
                    title={`Keep ${getCareer(currentLife.careerId)?.name ?? 'this career'}`}
                    meta={`${formatCash(salaryOf(currentLife.careerId))} each payday`}
                    onPress={() => void onCareer(currentLife.careerId!)}
                  />
                ) : null}
                {action.options.map((career) => (
                  <Choice
                    key={career.id}
                    title={career.name}
                    meta={`${formatCash(career.salary)} each payday`}
                    onPress={() => void onCareer(career.id)}
                  />
                ))}
              </View>
            ) : null}

            {action.kind === 'house' ? (
              <View style={styles.choices}>
                {HOUSES.map((house) => {
                  const trade = houseTrade(currentLife?.houseId ?? null, house.id);
                  const owned = currentLife?.houseId === house.id;
                  const meta = owned
                    ? 'Yours already'
                    : trade > 0
                      ? `Pay ${formatCash(trade)}`
                      : trade < 0
                        ? `Receive ${formatCash(-trade)}`
                        : formatCash(house.price);
                  return (
                    <Choice
                      key={house.id}
                      title={`${house.name} · ${formatCash(house.price)}`}
                      meta={meta}
                      onPress={() => void onHouse(house.id)}
                    />
                  );
                })}
              </View>
            ) : null}

            {action.kind === 'fork' ? (
              <View style={styles.choices}>
                <Choice
                  title="Country lane"
                  meta="Shorter road home, with one more payday."
                  onPress={() => void onRetire('country')}
                />
                <Choice
                  title="City estate"
                  meta="Longer road, with two life tiles and a payday."
                  onPress={() => void onRetire('estate')}
                />
              </View>
            ) : null}

            {action.kind === 'spin' ? (
              <Button
                label={`Spin for ${current?.name ?? 'this turn'}`}
                variant="primary"
                onPress={() => void onSpin()}
              />
            ) : null}

            <Text style={[typography.section, styles.section]}>Lives</Text>
            {snapshot.standings.map((standing) => {
              const person = life.players[standing.playerId];
              if (!person) return null;
              const color = LIFE_COLORS[colorIndexFor(life, standing.playerId)];
              const active = standing.playerId === life.currentPlayerId && !finished;
              const career = getCareer(person.careerId);
              return (
                <View key={standing.playerId} style={[styles.playerCard, active && styles.playerCardActive]}>
                  <View style={styles.playerTop}>
                    <View style={[styles.dot, { backgroundColor: color.fill }]} />
                    <Text style={styles.playerName}>
                      {standing.playerName}
                      {standing.playerId === localPlayerId ? ' · you' : ''}
                    </Text>
                    <Text style={styles.worth}>{formatCash(standing.total)}</Text>
                  </View>
                  <Text style={styles.playerMeta}>{placeLabel(person)}</Text>
                  <Text style={styles.playerMeta}>
                    {career ? `${formatCash(career.salary)} payday · ` : ''}
                    {formatCash(person.cash)} cash
                    {person.houseId ? ` · ${getHouse(person.houseId)?.name ?? 'house'}` : ''}
                    {familySuffix(person)}
                  </Text>
                </View>
              );
            })}

            <View style={styles.actions}>
              <Button
                label={confirmReset ? 'Confirm reset' : 'Reset board'}
                onPress={() => void onReset()}
              />
              {game.players.length < template.maxPlayers ? (
                <Button label="Add player" onPress={() => setAddingPlayer(true)} />
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        </ScrollView>

        {showCelebration ? (
          <FireworksOverlay
            winnerName={snapshot.winnerName}
            subtitle="Life"
            onDismiss={dismissCelebration}
          />
        ) : null}

        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const next = withAddedPlayer(game, name, template.maxPlayers);
            const updated: Game = { ...next, status: 'InProgress' };
            await saveGame(updated);
            setGame(updated);
            setError(null);
          }}
        />
      </View>
    </Screen>
  );
}

function Choice({ title, meta, onPress }: { title: string; meta: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.choice}>
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceMeta}>{meta}</Text>
    </Pressable>
  );
}

function turnDetail(life: PlayerLife, action: LifeAction): string {
  switch (action.kind) {
    case 'college-or-career':
      return 'choose college or a career';
    case 'career':
      if (action.reason === 'start') return 'pick a starter career';
      if (action.reason === 'graduate') return 'pick a degree career';
      return 'change career or keep this one';
    case 'house':
      return 'buy a house';
    case 'fork':
      return 'choose the country lane or the city estate';
    case 'spin':
      if (life.path === 'college') return 'spin through college';
      if (life.path === 'country') return 'spin along the country lane';
      if (life.path === 'estate') return 'spin toward the city estate';
      return 'spin and move';
    case 'done':
      return 'waiting';
  }
}

function placeLabel(life: PlayerLife): string {
  if (life.path === 'choice') return 'At the start';
  if (life.path === 'college') return 'In college';
  if (life.path === 'country') return 'On the country lane';
  if (life.path === 'estate') return 'On the city estate';
  if (life.path === 'retired') return life.exit === 'country' ? 'Retired to the country' : 'Retired to the city';
  const career = getCareer(life.careerId);
  return career?.name ?? 'On the track';
}

function familySuffix(life: PlayerLife): string {
  const bits: string[] = [];
  if (life.spouse) bits.push('married');
  if (life.children === 1) bits.push('1 child');
  else if (life.children > 1) bits.push(`${life.children} children`);
  return bits.length ? ` · ${bits.join(', ')}` : '';
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.md, gap: 8 },
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
  boardPane: { gap: 8 },
  boardPaneWide: { flex: 1.4, minWidth: 420 },
  boardScroll: { flexGrow: 1 },
  boardSizer: { width: '100%', minWidth: 760 },
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
  choices: { gap: 8 },
  choice: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  choiceTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  choiceMeta: { ...typography.body, fontSize: 13 },
  section: { marginTop: 4 },
  playerCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  playerCardActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  playerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  playerName: { ...typography.label, flex: 1 },
  worth: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  playerMeta: { ...typography.body, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
});

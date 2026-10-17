import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TokenPicker } from '../components/TokenPicker';
import { Button, Field, Screen } from '../components/ui';
import { setupDetail, setupSummary, type ChineseMode, type PlayerCount, type SetCount, type TwoSetGoals } from '../domain/chineseCheckers';
import type { DrawCount } from '../domain/klondike';
import type { SuitCount } from '../domain/spider';
import { nextOpolyToken, openingPlayer, playersFromOpolySeats } from '../domain/addPlayer';
import { createPlayer, type PlayMode, type Player } from '../domain/models';
import { playerToken } from '../domain/opoly';
import { getTemplate, templates, type GameTemplate } from '../domain/templates';
import { loadDisplayName, saveDisplayName } from '../storage/displayNameStore';
import { createAndSaveGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import { gameScreenForTemplate, type RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

type Seat = { id: string; name: string; token: string; emojiText: string };

function asksPlayMode(template: GameTemplate): boolean {
  return template.maxPlayers > 1;
}

function playersFromNameSeats(seats: Seat[]): { players: Player[] } | { error: string } {
  if (seats.length < 1) return { error: 'Add at least one player.' };
  const names = seats.map((seat) => seat.name.trim());
  if (names.some((name) => !name)) return { error: 'Enter a name for each player.' };
  const folded = names.map((name) => name.toLowerCase());
  if (new Set(folded).size !== folded.length) return { error: 'Each player needs a different name.' };
  return {
    players: seats.map((seat, index) => ({ id: seat.id, name: names[index] })),
  };
}

function newSeat(name: string, token: string): Seat {
  return { id: createPlayer(name).id, name, token, emojiText: '' };
}

function nextSeatName(seats: Seat[]): string {
  const taken = new Set(seats.map((seat) => seat.name.trim().toLowerCase()));
  for (let n = seats.length + 1; n < seats.length + 20; n += 1) {
    const name = `Player ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return 'Player';
}

export function SetupScreen({ navigation }: Props) {
  const [templateId, setTemplateId] = useState(templates[0].id);
  const template = useMemo(() => getTemplate(templateId)!, [templateId]);
  const [name, setName] = useState(templates[0].name);
  const [hostName, setHostName] = useState('Player 1');
  const [playMode, setPlayMode] = useState<PlayMode | null>(
    asksPlayMode(templates[0]) ? null : 'multi-device',
  );
  const [seats, setSeats] = useState<Seat[]>(() => [newSeat('Player 1', 'car')]);
  const [targetScore, setTargetScore] = useState(String(templates[0].defaultTargetScore ?? ''));
  const [maxRounds, setMaxRounds] = useState(String(templates[0].defaultMaxRounds ?? '18'));
  const [requireJumps, setRequireJumps] = useState(true);
  const [drawCount, setDrawCount] = useState<DrawCount>(1);
  const [suitCount, setSuitCount] = useState<SuitCount>(1);
  const [tableSize, setTableSize] = useState<PlayerCount>(6);
  const [tableMode, setTableMode] = useState<ChineseMode>('ffa');
  const [tableSets, setTableSets] = useState<SetCount>(1);
  const [tableGoals, setTableGoals] = useState<TwoSetGoals>('opponent');
  const [validation, setValidation] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passAndPlay = playMode === 'pass-and-play';
  const showSeats =
    playMode === 'pass-and-play' || (playMode === 'multi-device' && template.id === 'monopoly');

  useEffect(() => {
    void loadDisplayName().then((saved) => {
      const name = saved.trim();
      if (!name) return;
      setHostName(name);
      setSeats((current) => {
        const [first, ...rest] = current;
        if (!first || first.name !== 'Player 1') return current;
        return [{ ...first, name }, ...rest];
      });
    });
  }, []);

  const showTarget =
    template.winCondition === 'FirstToTarget' || template.defaultTargetScore != null;
  const showMaxRounds = template.id === 'golf' || template.defaultMaxRounds != null;

  const selectTemplate = (id: string) => {
    const t = getTemplate(id)!;
    setTemplateId(id);
    setName(t.name);
    setTargetScore(t.defaultTargetScore != null ? String(t.defaultTargetScore) : '');
    setMaxRounds(String(t.defaultMaxRounds ?? 18));
    setRequireJumps(true);
    setDrawCount(1);
    setSuitCount(1);
    setTableSize(6);
    setTableMode('ffa');
    setTableSets(1);
    setTableGoals('opponent');
    setPlayMode(asksPlayMode(t) ? null : 'multi-device');
    setSeats([newSeat(hostName.trim() || 'Player 1', 'car')]);
    setValidation(null);
  };

  const selectPlayMode = (mode: PlayMode) => {
    setPlayMode(mode);
    setSeats([newSeat(hostName.trim() || 'Player 1', 'car')]);
    setValidation(null);
  };

  const updateSeat = (id: string, patch: Partial<Seat>) => {
    setSeats((current) => current.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)));
    setValidation(null);
  };

  const addSeat = () => {
    setSeats((current) => {
      if (current.length >= template.maxPlayers) return current;
      const used = current.map((seat) => seat.emojiText.trim() || seat.token);
      return [...current, newSeat(nextSeatName(current), nextOpolyToken(used))];
    });
    setValidation(null);
  };

  const removeSeat = (id: string) => {
    const removingHost = seats[0]?.id === id;
    const nextHost = seats.find((seat) => seat.id !== id);
    setSeats((current) => (current.length <= 1 ? current : current.filter((seat) => seat.id !== id)));
    if (removingHost && nextHost) setHostName(nextHost.name);
    setValidation(null);
  };

  const start = async () => {
    const host = hostName.trim();
    const resolvedMode: PlayMode = asksPlayMode(template) ? playMode ?? 'multi-device' : 'multi-device';
    if (asksPlayMode(template) && playMode == null) {
      setValidation('Choose Pass ’n Play or separate devices.');
      return;
    }

    let players: Player[];
    if (template.id === 'monopoly') {
      const seatsForGame =
        resolvedMode === 'pass-and-play' ? seats : seats.slice(0, 1).map((seat) => ({
          ...seat,
          name: seat.name.trim() || host || 'Player 1',
        }));
      const monopolyPlayers = playersFromOpolySeats(seatsForGame, template.maxPlayers);
      if ('error' in monopolyPlayers) {
        setValidation(monopolyPlayers.error);
        return;
      }
      players = monopolyPlayers.players;
    } else if (resolvedMode === 'pass-and-play') {
      const named = playersFromNameSeats(seats);
      if ('error' in named) {
        setValidation(named.error);
        return;
      }
      players = named.players;
    } else {
      if (!host) {
        setValidation('Enter your display name.');
        return;
      }
      players = [openingPlayer(template.id, host)];
    }

    setBusy(true);
    setValidation(null);
    try {
      await saveDisplayName(players[0]?.name || host);

      const game = await createAndSaveGame({
        name: name.trim() || template.name,
        templateId: template.id,
        playMode: resolvedMode,
        players,
        targetScore: showTarget && targetScore ? Number(targetScore) : null,
        maxRounds: showMaxRounds && maxRounds ? Number(maxRounds) : null,
        requireJumps: template.id === 'checkers' ? requireJumps : undefined,
        drawCount: template.id === 'klondike' ? drawCount : undefined,
        suits: template.id === 'spider' ? suitCount : undefined,
        chinese:
          template.id === 'chinese-checkers'
            ? { playerCount: tableSize, mode: tableMode, sets: tableSets, twoSetGoals: tableGoals }
            : undefined,
      });

      navigation.replace(gameScreenForTemplate(template.id), { gameId: game.id });
    } catch (e) {
      setValidation(e instanceof Error ? e.message : 'Could not create game');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Text style={[typography.section, styles.sectionFirst]}>Template</Text>
        <View style={styles.wrap}>
          {templates.map((t) => {
            const active = templateId === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={t.name}
                accessibilityState={{ selected: active }}
                onPress={() => selectTemplate(t.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{t.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{template.description}</Text>

        {asksPlayMode(template) ? (
          <>
            <Text style={[typography.section, styles.section]}>How will you play?</Text>
            <View style={styles.wrap}>
              <Choice
                label="Pass ’n Play"
                selected={playMode === 'pass-and-play'}
                onPress={() => selectPlayMode('pass-and-play')}
              />
              <Choice
                label="Separate devices"
                selected={playMode === 'multi-device'}
                onPress={() => selectPlayMode('multi-device')}
              />
            </View>
            <Text style={styles.hint}>
              {playMode === 'pass-and-play'
                ? 'Everyone takes turns on this device. Add all players before you start.'
                : playMode === 'multi-device'
                  ? 'Start here, then share the join code so friends open the game on their own phones.'
                  : 'Pass ’n Play keeps everyone on one device. Separate devices uses the login / join code.'}
            </Text>
          </>
        ) : null}

        <Text style={[typography.section, styles.section]}>Game name</Text>
        <Field value={name} onChangeText={setName} />

        {showTarget ? (
          <>
            <Text style={[typography.section, styles.section]}>
              {template.id === 'sorry' ? 'Pawns home to win' : 'Target score'}
            </Text>
            <Field
              value={targetScore}
              onChangeText={setTargetScore}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        {showMaxRounds ? (
          <>
            <Text style={[typography.section, styles.section]}>Holes / max rounds</Text>
            <Field
              value={maxRounds}
              onChangeText={setMaxRounds}
              keyboardType="number-pad"
            />
          </>
        ) : null}

        {template.id === 'chinese-checkers' ? (
          <>
            <Text style={[typography.section, styles.section]}>Players</Text>
            <View style={styles.wrap}>
              {([2, 3, 4, 6] as const).map((count) => (
                <Choice key={count} label={String(count)} selected={tableSize === count} onPress={() => setTableSize(count)} />
              ))}
            </View>
            {tableSize === 6 || tableSize === 4 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sides</Text>
                <View style={styles.wrap}>
                  <Choice label="All versus all" selected={tableMode === 'ffa'} onPress={() => setTableMode('ffa')} />
                  <Choice label="Teams of two" selected={tableMode === 'teams'} onPress={() => setTableMode('teams')} />
                </View>
              </>
            ) : null}
            {tableSize === 3 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sets each</Text>
                <View style={styles.wrap}>
                  <Choice label="One set" selected={tableSets === 1} onPress={() => setTableSets(1)} />
                  <Choice label="Two sets" selected={tableSets === 2} onPress={() => setTableSets(2)} />
                </View>
              </>
            ) : null}
            {tableSize === 2 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sets each</Text>
                <View style={styles.wrap}>
                  <Choice label="One · 15" selected={tableSets === 1} onPress={() => setTableSets(1)} />
                  <Choice label="Two" selected={tableSets === 2} onPress={() => setTableSets(2)} />
                  <Choice label="Three" selected={tableSets === 3} onPress={() => setTableSets(3)} />
                </View>
                {tableSets === 2 ? (
                  <View style={styles.wrap}>
                    <Choice label="Opponent’s corners" selected={tableGoals === 'opponent'} onPress={() => setTableGoals('opponent')} />
                    <Choice label="One empty corner" selected={tableGoals === 'empty'} onPress={() => setTableGoals('empty')} />
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={styles.hint}>
              {setupSummary({ playerCount: tableSize, mode: tableMode, sets: tableSets, twoSetGoals: tableGoals })}
              {' — '}
              {setupDetail({ playerCount: tableSize, mode: tableMode, sets: tableSets, twoSetGoals: tableGoals })}
            </Text>
          </>
        ) : null}

        {template.id === 'klondike' ? (
          <>
            <Text style={[typography.section, styles.section]}>Draw</Text>
            <View style={styles.wrap}>
              <Choice label="Draw 1" selected={drawCount === 1} onPress={() => setDrawCount(1)} />
              <Choice label="Draw 3" selected={drawCount === 3} onPress={() => setDrawCount(3)} />
            </View>
            <Text style={styles.hint}>
              {drawCount === 1 ? 'Turn one card at a time.' : 'Turn three. Only the top card plays.'}
            </Text>
          </>
        ) : null}

        {template.id === 'spider' ? (
          <>
            <Text style={[typography.section, styles.section]}>Suits</Text>
            <View style={styles.wrap}>
              <Choice label="1 suit" selected={suitCount === 1} onPress={() => setSuitCount(1)} />
              <Choice label="2 suits" selected={suitCount === 2} onPress={() => setSuitCount(2)} />
              <Choice label="4 suits" selected={suitCount === 4} onPress={() => setSuitCount(4)} />
            </View>
            <Text style={styles.hint}>
              {suitCount === 1 ? 'All spades. The easier game.' : suitCount === 2 ? 'Spades and hearts.' : 'Two full decks.'}
            </Text>
          </>
        ) : null}

        {template.id === 'checkers' ? (
          <>
            <Text style={[typography.section, styles.section]}>Jumps</Text>
            <View style={styles.wrap}>
              <Choice label="Required" selected={requireJumps} onPress={() => setRequireJumps(true)} />
              <Choice label="Optional" selected={!requireJumps} onPress={() => setRequireJumps(false)} />
            </View>
            <Text style={styles.hint}>
              {requireJumps ? 'You must jump when you can.' : 'You may move without capturing.'}
            </Text>
          </>
        ) : null}

        {showSeats ? (
          <>
            <Text style={[typography.section, styles.section]}>
              {passAndPlay ? 'Players' : template.id === 'monopoly' ? 'Your piece' : 'Players'}
            </Text>
            <Text style={styles.hint}>
              {passAndPlay
                ? template.id === 'monopoly'
                  ? 'Add everyone at the table and pick a piece for each person.'
                  : 'Add everyone who will pass this device around.'
                : template.id === 'monopoly'
                  ? 'Pick your name and piece. Friends join with the share code.'
                  : 'Add players on this device.'}
            </Text>
            {(passAndPlay ? seats : seats.slice(0, 1)).map((seat, index) => {
              const taken = seats
                .filter((other) => other.id !== seat.id)
                .map((other) => playerToken(other.emojiText.trim() || other.token)?.emoji)
                .filter((emoji): emoji is string => Boolean(emoji));
              return (
                <View key={seat.id} style={styles.seat}>
                  <View style={styles.seatName}>
                    <Field
                      value={seat.name}
                      onChangeText={(text) => {
                        updateSeat(seat.id, { name: text });
                        if (index === 0) setHostName(text);
                      }}
                      placeholder={index === 0 ? 'Your name' : 'Player name'}
                      accessibilityLabel={index === 0 ? 'Your name' : `Player ${index + 1} name`}
                      maxLength={40}
                      style={styles.seatField}
                    />
                    {passAndPlay && seats.length > 1 ? (
                      <Button
                        label="Remove"
                        variant="ghost"
                        onPress={() => removeSeat(seat.id)}
                      />
                    ) : null}
                  </View>
                  {template.id === 'monopoly' ? (
                    <TokenPicker
                      value={seat.token}
                      text={seat.emojiText}
                      taken={taken}
                      onChange={(token) => updateSeat(seat.id, { token })}
                      onText={(emojiText) => updateSeat(seat.id, { emojiText })}
                    />
                  ) : null}
                </View>
              );
            })}
            {passAndPlay && seats.length < template.maxPlayers ? (
              <Button label="Add player" variant="secondary" onPress={addSeat} style={styles.addPlayer} />
            ) : null}
            {passAndPlay && seats.length >= template.maxPlayers ? (
              <Text style={styles.hint}>All {template.maxPlayers} seats are filled.</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[typography.section, styles.section]}>Your name</Text>
            <Text style={styles.hint}>
              {template.id === 'klondike' || template.id === 'pyramid' || template.id === 'tripeaks' || template.id === 'spider'
                ? 'Solo. Use this name on another device to keep playing.'
                : 'Start alone, then share the code so others can join.'}
            </Text>
            <Field
              value={hostName}
              onChangeText={(text) => {
                setHostName(text);
                setValidation(null);
              }}
              placeholder="Your name"
              maxLength={40}
            />
          </>
        )}

        {validation ? <Text style={styles.error}>{validation}</Text> : null}

        <View style={styles.row}>
          <Button
            label={busy ? 'Creating…' : 'Start'}
            variant="primary"
            busy={busy}
            onPress={() => void start()}
            style={{ flex: 1 }}
          />
          <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </Screen>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipActive]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: space.xl, gap: 4 },
  section: { marginTop: space.sm, marginBottom: 2 },
  sectionFirst: { marginTop: 0, marginBottom: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipLabel: {
    ...typography.label,
    fontWeight: '700',
  },
  chipLabelActive: { color: colors.accent },
  hint: {
    ...typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: space.sm },
  seat: {
    marginTop: space.sm,
    padding: space.sm,
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  seatName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seatField: { flex: 1 },
  addPlayer: { alignSelf: 'flex-start', marginTop: space.sm },
  error: { color: colors.danger, marginTop: space.sm },
});

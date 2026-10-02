import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Field, Screen } from '../components/ui';
import { setupDetail, setupSummary, type ChineseMode, type PlayerCount, type SetCount, type TwoSetGoals } from '../domain/chineseCheckers';
import type { DrawCount } from '../domain/klondike';
import type { SuitCount } from '../domain/spider';
import { createPlayer } from '../domain/models';
import { getTemplate, templates } from '../domain/templates';
import { loadDisplayName, saveDisplayName } from '../storage/displayNameStore';
import { createAndSaveGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import { gameScreenForTemplate, type RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

export function SetupScreen({ navigation }: Props) {
  const [templateId, setTemplateId] = useState(templates[0].id);
  const template = useMemo(() => getTemplate(templateId)!, [templateId]);
  const [name, setName] = useState(templates[0].name);
  const [hostName, setHostName] = useState('Player 1');
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

  useEffect(() => {
    void loadDisplayName().then((saved) => {
      if (saved.trim()) setHostName(saved.trim());
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
    setValidation(null);
  };

  const start = async () => {
    const host = hostName.trim();
    if (!host) {
      setValidation('Enter your display name.');
      return;
    }

    setBusy(true);
    setValidation(null);
    try {
      await saveDisplayName(host);

      const game = await createAndSaveGame({
        name: name.trim() || template.name,
        templateId: template.id,
        players: [createPlayer(host)],
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
      <ScrollView contentContainerStyle={styles.content}>
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

        <Text style={[typography.section, styles.section]}>Your name</Text>
        <Text style={styles.hint}>
          {template.id === 'klondike' || template.id === 'pyramid' || template.id === 'spider'
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
      </ScrollView>
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
  error: { color: colors.danger, marginTop: space.sm },
});

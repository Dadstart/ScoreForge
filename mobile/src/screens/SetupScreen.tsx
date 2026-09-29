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
        <Text style={typography.title}>New Game</Text>
        <Text style={[typography.subtitle, { marginBottom: 8 }]}>
          Pick a template, name yourself, then share the code so others can join.
        </Text>

        <Text style={[typography.section, styles.section]}>Template</Text>
        {templates.map((t) => {
          const active = templateId === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => selectTemplate(t.id)}
              style={[styles.template, active && styles.templateActive]}
            >
              <Text style={[styles.templateName, active && { color: colors.accent }]}>
                {t.name}
              </Text>
              <Text style={typography.body}>{t.description}</Text>
            </Pressable>
          );
        })}

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
            <View style={styles.choiceRow}>
              {([2, 3, 4, 6] as const).map((count) => (
                <Pressable
                  key={count}
                  onPress={() => setTableSize(count)}
                  style={[styles.choice, tableSize === count && styles.choiceActive]}
                >
                  <Text style={[styles.choiceLabel, tableSize === count && { color: colors.accent }]}>{count}</Text>
                </Pressable>
              ))}
            </View>
            {tableSize === 6 || tableSize === 4 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sides</Text>
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={() => setTableMode('ffa')}
                    style={[styles.choice, tableMode === 'ffa' && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableMode === 'ffa' && { color: colors.accent }]}>All versus all</Text>
                    <Text style={typography.body}>Each color races alone. Later places keep playing.</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTableMode('teams')}
                    style={[styles.choice, tableMode === 'teams' && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableMode === 'teams' && { color: colors.accent }]}>Teams of two</Text>
                    <Text style={typography.body}>Partners sit opposite and each move their own color.</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {tableSize === 3 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sets each</Text>
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={() => setTableSets(1)}
                    style={[styles.choice, tableSets === 1 && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableSets === 1 && { color: colors.accent }]}>One set</Text>
                    <Text style={typography.body}>Race into the empty opposite corner.</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTableSets(2)}
                    style={[styles.choice, tableSets === 2 && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableSets === 2 && { color: colors.accent }]}>Two sets</Text>
                    <Text style={typography.body}>Control both colors on opposite points.</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {tableSize === 2 ? (
              <>
                <Text style={[typography.section, styles.section]}>Sets each</Text>
                <View style={styles.choiceRow}>
                  <Pressable
                    onPress={() => setTableSets(1)}
                    style={[styles.choice, tableSets === 1 && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableSets === 1 && { color: colors.accent }]}>One · 15</Text>
                    <Text style={typography.body}>Fifteen pieces into the opponent’s camp.</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTableSets(2)}
                    style={[styles.choice, tableSets === 2 && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableSets === 2 && { color: colors.accent }]}>Two</Text>
                    <Text style={typography.body}>Two colors each.</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTableSets(3)}
                    style={[styles.choice, tableSets === 3 && styles.choiceActive]}
                  >
                    <Text style={[styles.choiceLabel, tableSets === 3 && { color: colors.accent }]}>Three</Text>
                    <Text style={typography.body}>Into the opponent’s three corners.</Text>
                  </Pressable>
                </View>
                {tableSets === 2 ? (
                  <View style={[styles.choiceRow, { marginTop: 8 }]}>
                    <Pressable
                      onPress={() => setTableGoals('opponent')}
                      style={[styles.choice, tableGoals === 'opponent' && styles.choiceActive]}
                    >
                      <Text style={[styles.choiceLabel, tableGoals === 'opponent' && { color: colors.accent }]}>
                        Opponent’s corners
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setTableGoals('empty')}
                      style={[styles.choice, tableGoals === 'empty' && styles.choiceActive]}
                    >
                      <Text style={[styles.choiceLabel, tableGoals === 'empty' && { color: colors.accent }]}>
                        One empty corner
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={[typography.body, { marginTop: 8 }]}>
              {setupSummary({ playerCount: tableSize, mode: tableMode, sets: tableSets, twoSetGoals: tableGoals })}
              {' — '}
              {setupDetail({ playerCount: tableSize, mode: tableMode, sets: tableSets, twoSetGoals: tableGoals })}
            </Text>
          </>
        ) : null}

        {template.id === 'checkers' ? (
          <>
            <Text style={[typography.section, styles.section]}>Jumps</Text>
            <View style={styles.choiceRow}>
              <Pressable
                onPress={() => setRequireJumps(true)}
                style={[styles.choice, requireJumps && styles.choiceActive]}
              >
                <Text style={[styles.choiceLabel, requireJumps && { color: colors.accent }]}>Required</Text>
                <Text style={typography.body}>You must jump when you can.</Text>
              </Pressable>
              <Pressable
                onPress={() => setRequireJumps(false)}
                style={[styles.choice, !requireJumps && styles.choiceActive]}
              >
                <Text style={[styles.choiceLabel, !requireJumps && { color: colors.accent }]}>Optional</Text>
                <Text style={typography.body}>You may move without capturing.</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Text style={[typography.section, styles.section]}>Your name</Text>
        <Text style={[typography.body, { marginBottom: 8 }]}>
          Start alone. Share the game code so others can join.
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

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 48, gap: 8 },
  section: { marginTop: 14, marginBottom: 6 },
  template: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.lg,
    marginBottom: 8,
    gap: 6,
  },
  templateActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  templateName: {
    ...typography.label,
    fontSize: 17,
    fontWeight: '700',
  },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.md,
    gap: 4,
  },
  choiceActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  choiceLabel: {
    ...typography.label,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  error: { color: colors.danger, marginTop: 8 },
});

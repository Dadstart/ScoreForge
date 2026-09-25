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
            <Text style={[typography.section, styles.section]}>Target score</Text>
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
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  error: { color: colors.danger, marginTop: 8 },
});

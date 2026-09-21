import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { createGame, createPlayer } from '../domain/models';
import { getTemplate, templates } from '../domain/templates';
import { saveGame } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Setup'>;

export function SetupScreen({ navigation }: Props) {
  const [templateId, setTemplateId] = useState(templates[0].id);
  const template = useMemo(() => getTemplate(templateId)!, [templateId]);
  const [name, setName] = useState(templates[0].name);
  const [players, setPlayers] = useState(['Player 1', 'Player 2']);
  const [targetScore, setTargetScore] = useState(String(templates[0].defaultTargetScore ?? ''));
  const [maxRounds, setMaxRounds] = useState(String(templates[0].defaultMaxRounds ?? '18'));
  const [validation, setValidation] = useState<string | null>(null);

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
    const names = players.map((p) => p.trim()).filter(Boolean);
    if (names.length < template.minPlayers) {
      setValidation(`Add at least ${template.minPlayers} players.`);
      return;
    }
    if (names.length > template.maxPlayers) {
      setValidation(`At most ${template.maxPlayers} players.`);
      return;
    }

    const game = createGame({
      name: name.trim() || template.name,
      templateId: template.id,
      players: names.map((n) => createPlayer(n)),
      targetScore: showTarget && targetScore ? Number(targetScore) : null,
      maxRounds: showMaxRounds && maxRounds ? Number(maxRounds) : null,
    });

    await saveGame(game);
    if (template.id === 'cribbage') {
      navigation.replace('Cribbage', { gameId: game.id });
    } else {
      navigation.replace('Board', { gameId: game.id });
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>New Game</Text>

      <Text style={styles.label}>Template</Text>
      {templates.map((t) => (
        <Pressable
          key={t.id}
          style={[styles.template, templateId === t.id && styles.templateActive]}
          onPress={() => selectTemplate(t.id)}
        >
          <Text style={styles.cardTitle}>{t.name}</Text>
          <Text style={styles.muted}>{t.description}</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>Game name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={colors.muted} />

      {showTarget ? (
        <>
          <Text style={styles.label}>Target score</Text>
          <TextInput
            style={styles.input}
            value={targetScore}
            onChangeText={setTargetScore}
            keyboardType="number-pad"
            placeholderTextColor={colors.muted}
          />
        </>
      ) : null}

      {showMaxRounds ? (
        <>
          <Text style={styles.label}>Holes / max rounds</Text>
          <TextInput
            style={styles.input}
            value={maxRounds}
            onChangeText={setMaxRounds}
            keyboardType="number-pad"
            placeholderTextColor={colors.muted}
          />
        </>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.label}>Players</Text>
        <Pressable
          style={styles.btn}
          onPress={() => {
            if (players.length >= template.maxPlayers) {
              setValidation(`This template allows at most ${template.maxPlayers} players.`);
              return;
            }
            setPlayers((p) => [...p, `Player ${p.length + 1}`]);
          }}
        >
          <Text style={styles.btnText}>Add player</Text>
        </Pressable>
      </View>

      {players.map((player, index) => (
        <View key={index} style={styles.playerRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={player}
            onChangeText={(text) =>
              setPlayers((all) => all.map((p, i) => (i === index ? text : p)))
            }
            placeholderTextColor={colors.muted}
          />
          <Pressable
            style={styles.btn}
            onPress={() => {
              if (players.length <= 1) return;
              setPlayers((all) => all.filter((_, i) => i !== index));
            }}
          >
            <Text style={styles.btnText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      {validation ? <Text style={styles.error}>{validation}</Text> : null}

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.accent]} onPress={() => void start()}>
          <Text style={styles.btnText}>Start</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  label: { color: colors.text, fontWeight: '700', marginTop: 8 },
  muted: { color: colors.muted },
  template: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  templateActive: { borderColor: colors.accent },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 16 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btn: {
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  accent: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
  error: { color: colors.danger },
});

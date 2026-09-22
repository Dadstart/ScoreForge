import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { normalizeShareCode } from '../domain/models';
import { getTemplate } from '../domain/templates';
import { loadDisplayName, saveDisplayName } from '../storage/displayNameStore';
import { findGameByShareCode, joinGameByShareCode } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export function JoinScreen({ navigation }: Props) {
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  const join = async () => {
    const normalized = normalizeShareCode(code);
    const name = displayName.trim();
    if (!name) {
      setError('Enter a display name.');
      return;
    }
    if (normalized.length < 4) {
      setError('Enter the full share code from the host.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveDisplayName(name);
      const existing = await findGameByShareCode(normalized);
      const maxPlayers = existing
        ? (getTemplate(existing.templateId)?.maxPlayers ?? 12)
        : 12;
      const game = await joinGameByShareCode(normalized, name, maxPlayers);
      if (game.templateId === 'cribbage') {
        navigation.replace('Cribbage', { gameId: game.id });
      } else {
        navigation.replace('Board', { gameId: game.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join game');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Join with code</Text>
      <Text style={styles.subtitle}>
        Enter your display name and the magic code shared by the host.
      </Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.nameInput}
        value={displayName}
        onChangeText={(t) => {
          setDisplayName(t);
          setError(null);
        }}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder="Your name"
        placeholderTextColor={colors.muted}
        maxLength={40}
      />

      <Text style={styles.label}>Share code</Text>
      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={(t) => {
          setCode(t.toUpperCase());
          setError(null);
        }}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="e.g. K7M2QX"
        placeholderTextColor={colors.muted}
        maxLength={8}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.btn, styles.accent]}
        disabled={busy}
        onPress={() => void join()}
      >
        {busy ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.btnText}>Join game</Text>
        )}
      </Pressable>
      <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
        <Text style={styles.btnText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, lineHeight: 22, marginBottom: 8 },
  label: { color: colors.muted, fontWeight: '600', marginTop: 4 },
  nameInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '600',
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 28,
    letterSpacing: 3,
    fontWeight: '800',
  },
  error: { color: colors.danger },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
  },
  accent: { backgroundColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '600' },
});

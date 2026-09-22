import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Field, Screen } from '../components/ui';
import { normalizeShareCode } from '../domain/models';
import { getTemplate } from '../domain/templates';
import { loadDisplayName, saveDisplayName } from '../storage/displayNameStore';
import { findGameByShareCode, joinGameByShareCode } from '../storage/gameStore';
import { colors, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

export function JoinScreen({ navigation, route }: Props) {
  const initialCode = normalizeShareCode(route.params?.code ?? '');
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const fromRoute = normalizeShareCode(route.params?.code ?? '');
    if (fromRoute) setCode(fromRoute);
  }, [route.params?.code]);

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
    <Screen>
      <View style={styles.screen}>
        <Text style={typography.title}>Join with code</Text>
        <Text style={typography.subtitle}>
          {initialCode
            ? 'QR detected. Enter your display name to join this cloud game.'
            : 'Enter your name and the host share code (works across devices).'}
        </Text>

        <Text style={[typography.section, styles.section]}>Display name</Text>
        <Field
          value={displayName}
          onChangeText={(t) => {
            setDisplayName(t);
            setError(null);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="Your name"
          maxLength={40}
        />

        <Text style={[typography.section, styles.section]}>Share code</Text>
        <Field
          mono
          value={code}
          onChangeText={(t) => {
            setCode(t.toUpperCase());
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="K7M2QX"
          maxLength={8}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.row}>
          <Button
            label="Join game"
            variant="primary"
            busy={busy}
            onPress={() => void join()}
            style={{ flex: 1 }}
          />
          <Button label="Cancel" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: 10 },
  section: { marginTop: 10, marginBottom: 4 },
  error: { color: colors.danger },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
});

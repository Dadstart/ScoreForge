import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getTemplate } from '../domain/templates';
import type { Game } from '../domain/models';
import { deleteGame, loadGames } from '../storage/gameStore';
import { colors } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const list = await loadGames();
      setGames([...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load games');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      void refresh();
    });
    return unsub;
  }, [navigation, refresh]);

  const openGame = (game: Game) => {
    if (game.templateId === 'cribbage') {
      navigation.navigate('Cribbage', { gameId: game.id });
    } else {
      navigation.navigate('Board', { gameId: game.id });
    }
  };

  const onDelete = async (id: string) => {
    await deleteGame(id);
    await refresh();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Games</Text>
      <Text style={styles.subtitle}>Resume a saved game or start something new.</Text>

      <View style={styles.row}>
        <Pressable style={[styles.btn, styles.accent]} onPress={() => navigation.navigate('Setup')}>
          <Text style={styles.btnText}>New Game</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => navigation.navigate('Join')}>
          <Text style={styles.btnText}>Join with code</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => void refresh()}>
          <Text style={styles.btnText}>Refresh</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => navigation.navigate('Settings')}>
          <Text style={styles.btnText}>Settings</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} /> : null}

      {!busy &&
        games.map((game) => {
          const templateName = getTemplate(game.templateId)?.name ?? game.templateId;
          return (
            <View key={game.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{game.name || 'Untitled game'}</Text>
                <Text style={styles.code}>Code {game.shareCode}</Text>
                <Text style={styles.muted}>
                  {templateName} · {game.status === 'Completed' ? 'Completed' : 'In progress'}
                </Text>
                <Text style={styles.muted}>
                  Updated {new Date(game.updatedAt).toLocaleString()}
                </Text>
              </View>
              <View style={styles.cardActions}>
                <Pressable style={[styles.btn, styles.accent]} onPress={() => openGame(game)}>
                  <Text style={styles.btnText}>Resume</Text>
                </Pressable>
                <Pressable style={styles.btn} onPress={() => void onDelete(game.id)}>
                  <Text style={styles.btnText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

      {!busy && games.length === 0 ? (
        <Text style={[styles.muted, { marginTop: 32, textAlign: 'center' }]}>
          No saved games yet. Tap New Game to begin.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, marginTop: 4, marginBottom: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
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
  error: { color: colors.danger, marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.surface,
    gap: 10,
  },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  code: {
    color: colors.accent,
    marginTop: 6,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  muted: { color: colors.muted, marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 8 },
});

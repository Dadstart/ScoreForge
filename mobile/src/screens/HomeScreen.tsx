import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Card, Screen } from '../components/ui';
import { getTemplate } from '../domain/templates';
import type { Game } from '../domain/models';
import { deleteGame, loadGames } from '../storage/gameStore';
import { colors, space, typography } from '../theme';
import { gameScreenForTemplate, type RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
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
    navigation.navigate(gameScreenForTemplate(game.templateId), { gameId: game.id });
  };

  const onDelete = async (id: string) => {
    await deleteGame(id);
    await refresh();
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text style={typography.brand}>ScoreForge</Text>
        <Text style={[typography.subtitle, styles.lead]}>
          Keep score together — share a code, everyone tracks their own points.
        </Text>

        <View style={styles.actions}>
          <Button
            label="New Game"
            variant="primary"
            onPress={() => navigation.navigate('Setup')}
            style={styles.actionGrow}
          />
          <Button
            label="Join with code"
            onPress={() => navigation.navigate('Join')}
            style={styles.actionGrow}
          />
        </View>
        <View style={styles.actions}>
          <Button label="Refresh" variant="ghost" onPress={() => void refresh()} />
          <Button
            label="Settings"
            variant="ghost"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} /> : null}

        {!busy && games.length > 0 ? (
          <Text style={[typography.section, { marginTop: 20, marginBottom: 10 }]}>
            Your games
          </Text>
        ) : null}

        {!busy &&
          games.map((game) => {
            const templateName = getTemplate(game.templateId)?.name ?? game.templateId;
            const done = game.status === 'Completed';
            return (
              <Card key={game.id} style={styles.gameCard}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.cardTitle}>{game.name || 'Untitled game'}</Text>
                    <View style={styles.metaRow}>
                      <Badge label={templateName} tone="accent" />
                      <Badge
                        label={done ? 'Completed' : 'In progress'}
                        tone={done ? 'success' : 'neutral'}
                      />
                    </View>
                    <Text style={styles.muted}>
                      Updated {new Date(game.updatedAt).toLocaleString()}
                    </Text>
                  </View>
                  <ShareCodePanel shareCode={game.shareCode} />
                </View>
                <View style={styles.cardActions}>
                  <Button
                    label="Resume"
                    variant="primary"
                    onPress={() => openGame(game)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label="Delete"
                    variant="danger"
                    onPress={() => void onDelete(game.id)}
                  />
                </View>
              </Card>
            );
          })}

        {!busy && games.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTitle}>No games yet</Text>
            <Text style={typography.body}>
              Start a new game, then share the code or QR so friends can join from any device.
            </Text>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: 4 },
  lead: { marginTop: 6, marginBottom: 20, maxWidth: 420 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  actionGrow: { flexGrow: 1, minWidth: 140 },
  error: { color: colors.danger, marginVertical: 8 },
  gameCard: { marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { ...typography.title, fontSize: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  muted: { color: colors.muted, fontSize: 13 },
  cardActions: { flexDirection: 'row', gap: 8 },
  empty: { marginTop: 28, alignItems: 'flex-start' },
  emptyTitle: { ...typography.title, fontSize: 22 },
});

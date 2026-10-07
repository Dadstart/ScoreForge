import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { Button, Card, Screen } from '../components/ui';
import type { Game } from '../domain/models';
import { getTemplate } from '../domain/templates';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation, route }: Props) {
  const gameId = route.params?.gameId;
  const [game, setGame] = useState<Game | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const template = game ? getTemplate(game.templateId) : undefined;

  useEffect(() => {
    if (!gameId) return;
    return subscribeGame(
      gameId,
      (found) => setGame((current) => (found ? preferNewerGame(current, found) : null)),
      (err) => setActionError(err.message),
    );
  }, [gameId]);

  const resetGame = async () => {
    if (!game) return;
    try {
      const saved = await saveGame({
        ...game,
        events: [],
        status: 'InProgress',
        tokenSpaces: {},
        updatedAt: new Date().toISOString(),
      });
      setGame((current) => preferNewerGame(current, saved));
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reset the game');
    }
  };

  return (
    <Screen>
      <View style={styles.screen}>
        {game && template ? (
          <View style={styles.group}>
            <Text style={typography.section}>Monopoly</Text>
            <Card>
              <View style={styles.actions}>
                <Button label="Reset" onPress={() => void resetGame()} />
                {game.players.length < template.maxPlayers ? (
                  <Button label="Add player" onPress={() => setAddingPlayer(true)} />
                ) : null}
              </View>
              {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
            </Card>
          </View>
        ) : null}
        <Button label="OK" variant="primary" onPress={() => navigation.goBack()} style={styles.ok} />
      </View>
      {game && template ? (
        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
            setGame((current) => preferNewerGame(current, saved));
            setActionError(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: 14 },
  group: { gap: 8 },
  ok: { alignSelf: 'flex-start', minWidth: 96 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  error: { color: colors.danger, marginTop: 12 },
});

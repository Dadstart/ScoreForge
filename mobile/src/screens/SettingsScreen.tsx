import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { Button, Card, Screen } from '../components/ui';
import { withAddedPlayer } from '../domain/addPlayer';
import type { Game } from '../domain/models';
import { getTemplate } from '../domain/templates';
import { useSettings } from '../hooks/useSettings';
import { saveGame, subscribeGame } from '../storage/gameStore';
import type { Settings } from '../storage/settingsStore';
import { colors, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

type SettingOption = {
  id: keyof Settings;
  group: string;
  title: string;
  description: string;
};

const options: SettingOption[] = [
  {
    id: 'showMonopolyBoard',
    group: 'Monopoly',
    title: 'Show the board',
    description: 'Drag pieces around the board during a Monopoly game.',
  },
];

export function SettingsScreen({ navigation, route }: Props) {
  const gameId = route.params?.gameId;
  const [settings, update] = useSettings();
  const [game, setGame] = useState<Game | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const groups = useMemo(() => [...new Set(options.map((option) => option.group))], []);
  const template = game ? getTemplate(game.templateId) : undefined;

  useEffect(() => {
    if (!gameId) return;
    return subscribeGame(gameId, setGame, (err) => setActionError(err.message));
  }, [gameId]);

  const resetGame = async () => {
    if (!game) return;
    try {
      await saveGame({
        ...game,
        events: [],
        status: 'InProgress',
        tokenSpaces: {},
        updatedAt: new Date().toISOString(),
      });
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reset the game');
    }
  };

  return (
    <Screen>
      <View style={styles.screen}>
        {groups.map((group) => (
          <View key={group} style={styles.group}>
            <Text style={typography.section}>{group}</Text>
            <Card>
              {options
                .filter((option) => option.group === group)
                .map((option, index, groupOptions) => {
                  const enabled = settings[option.id];
                  return (
                    <View
                      key={option.id}
                      style={[styles.row, index < groupOptions.length - 1 && styles.rowDivider]}
                    >
                      <View style={styles.copy}>
                        <Text style={[typography.body, styles.title]}>{option.title}</Text>
                        <Text style={typography.subtitle}>{option.description}</Text>
                      </View>
                      <Switch
                        accessibilityLabel={option.title}
                        value={enabled}
                        onValueChange={(value) => update({ [option.id]: value })}
                        trackColor={{ false: colors.borderStrong, true: colors.accent }}
                        thumbColor={enabled ? colors.accentText : colors.text}
                      />
                    </View>
                  );
                })}
              {group === 'Monopoly' && game && template ? (
                <View style={styles.actions}>
                  <Button label="Reset" onPress={() => void resetGame()} />
                  {game.players.length < template.maxPlayers ? (
                    <Button label="Add player" onPress={() => setAddingPlayer(true)} />
                  ) : null}
                </View>
              ) : null}
              {group === 'Monopoly' && actionError ? (
                <Text style={styles.error}>{actionError}</Text>
              ) : null}
            </Card>
          </View>
        ))}
        <Button label="OK" variant="primary" onPress={() => navigation.goBack()} style={styles.ok} />
      </View>
      {game && template ? (
        <AddPlayerModal
          visible={addingPlayer}
          maxPlayers={template.maxPlayers}
          currentCount={game.players.length}
          onCancel={() => setAddingPlayer(false)}
          onAdd={async (name) => {
            await saveGame(withAddedPlayer(game, name, template.maxPlayers));
            setActionError(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: 14 },
  group: { gap: 8 },
  ok: { alignSelf: 'flex-start', minWidth: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingBottom: 14,
    marginBottom: 14,
  },
  copy: { flex: 1, gap: 4 },
  title: {
    color: colors.text,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  error: { color: colors.danger, marginTop: 12 },
});

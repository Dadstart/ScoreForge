import { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Screen } from '../components/ui';
import { useSettings } from '../hooks/useSettings';
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

export function SettingsScreen({ navigation }: Props) {
  const [settings, update] = useSettings();
  const groups = useMemo(() => [...new Set(options.map((option) => option.group))], []);

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
            </Card>
          </View>
        ))}
        <Button label="OK" variant="primary" onPress={() => navigation.goBack()} style={styles.ok} />
      </View>
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
});

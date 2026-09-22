import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Screen } from '../components/ui';
import { space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={styles.screen}>
        <Text style={typography.title}>Settings</Text>
        <Card>
          <Text style={typography.body}>
            ScoreForge runs as an Expo app. Use Expo Go on a phone, or open this project in a
            browser with npm run web.
          </Text>
          <Text style={typography.body}>
            The palette is a dark felt-table look with brass accents. System light/dark theming
            can be added later.
          </Text>
        </Card>
        <Button label="Back" variant="ghost" onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space.lg, gap: 14 },
});

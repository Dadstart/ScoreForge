import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { GameHelp } from './GameHelp';
import { HomeButton } from './HomeButton';
import { ShareCodePanel } from './ShareCodePanel';
import { Badge } from './ui';
import { colors, radii, typography } from '../theme';

/** Title, help, share code, and home, shared by the live game screens. */
export function GameHeader({
  name,
  badge,
  templateId,
  shareCode,
  passAndPlay,
  onHome,
  tools,
  titleStyle,
}: {
  name: string;
  badge?: string;
  templateId: string;
  shareCode: string;
  passAndPlay: boolean;
  onHome: () => void;
  tools?: ReactNode;
  titleStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.title}>
        <Text style={[typography.title, titleStyle]}>{name}</Text>
        {badge ? <Badge label={badge} tone="accent" /> : null}
      </View>
      {tools}
      <GameHelp templateId={templateId} />
      <ShareCodePanel shareCode={shareCode} passAndPlay={passAndPlay} />
      <HomeButton onPress={onHome} />
    </View>
  );
}

export function GameBanner({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>{title}</Text>
      {children}
    </View>
  );
}

export function GameError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, gap: 4 },
  banner: { backgroundColor: colors.surface, borderRadius: radii.md, padding: 10, gap: 4 },
  bannerText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14 },
});

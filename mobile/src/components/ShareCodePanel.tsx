import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from './ui';
import { createJoinShareUrl } from '../linking/shareLinks';
import { colors, radii, typography } from '../theme';

type Props = {
  shareCode: string;
};

function ShareIcon({ size = 20, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2" />
      <Circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2" />
      <Circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2" />
      <Path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export function ShareCodePanel({ shareCode }: Props) {
  const [open, setOpen] = useState(false);
  const url = createJoinShareUrl(shareCode);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Share game code"
      >
        <ShareIcon />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss share dialog"
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Share game</Text>
            <Text style={typography.subtitle}>Friends scan the QR or enter this code.</Text>
            <Text style={typography.code}>{shareCode}</Text>
            <View style={styles.qrFrame}>
              <QRCode
                value={url}
                size={180}
                backgroundColor={colors.text}
                color={colors.bg}
              />
            </View>
            <Button label="Close" onPress={() => setOpen(false)} style={{ alignSelf: 'stretch' }} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    alignItems: 'center',
    gap: 12,
  },
  sheetTitle: {
    ...typography.title,
    fontSize: 22,
    alignSelf: 'stretch',
  },
  qrFrame: {
    padding: 14,
    backgroundColor: colors.text,
    borderRadius: radii.md,
  },
});

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
import { createJoinShareUrl } from '../linking/shareLinks';
import { colors } from '../theme';

type Props = {
  shareCode: string;
};

function ShareIcon({ size = 22, color = colors.text }: { size?: number; color?: string }) {
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
        style={styles.iconBtn}
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
            style={StyleSheet.absoluteFillObject}
            onPress={() => setOpen(false)}
            accessibilityLabel="Dismiss share dialog"
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Share game</Text>
            <Text style={styles.code}>{shareCode}</Text>
            <View style={styles.qrFrame}>
              <QRCode
                value={url}
                size={180}
                backgroundColor={colors.text}
                color={colors.bg}
              />
            </View>
            <Text style={styles.hint}>Scan QR to open Join with this code</Text>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
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
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    alignSelf: 'stretch',
  },
  code: {
    color: colors.accent,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
  },
  qrFrame: {
    padding: 12,
    backgroundColor: colors.text,
    borderRadius: 10,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  closeText: { color: colors.text, fontWeight: '600' },
});

import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { createJoinShareUrl } from '../linking/shareLinks';
import { colors } from '../theme';

type Props = {
  shareCode: string;
  /** Compact layout for list cards; full for board headers. */
  size?: 'compact' | 'large';
};

export function ShareCodePanel({ shareCode, size = 'large' }: Props) {
  const url = createJoinShareUrl(shareCode);
  const qrSize = size === 'compact' ? 96 : 168;

  return (
    <View style={[styles.wrap, size === 'compact' && styles.wrapCompact]}>
      <Text style={[styles.code, size === 'compact' && styles.codeCompact]}>{shareCode}</Text>
      <View style={styles.qrFrame}>
        <QRCode
          value={url}
          size={qrSize}
          backgroundColor={colors.text}
          color={colors.bg}
        />
      </View>
      <Text style={styles.hint}>
        {size === 'compact' ? 'Scan to join' : 'Scan QR to open Join with this code'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
  },
  wrapCompact: {
    marginTop: 6,
  },
  code: {
    color: colors.accent,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
  },
  codeCompact: {
    fontSize: 22,
    letterSpacing: 2,
  },
  qrFrame: {
    padding: 10,
    backgroundColor: colors.text,
    borderRadius: 8,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});

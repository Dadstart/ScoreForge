import { StyleSheet, Text, View } from 'react-native';
import { cardInfo, type CardKind } from '../domain/sorry';
import { fonts, radii } from '../theme';

type Props = {
  card: CardKind | 'back';
  compact?: boolean;
};

export function SorryCard({ card, compact }: Props) {
  const size = compact ? styles.compact : styles.full;
  if (card === 'back') {
    return (
      <View style={[styles.face, styles.back, size]}>
        <View style={styles.diamond} />
        <Text style={styles.backLabel}>Deck</Text>
      </View>
    );
  }

  const info = cardInfo(card);
  const sorry = card === 'sorry';
  return (
    <View style={[styles.face, size, sorry && styles.sorryFace]}>
      <Text style={[styles.corner, sorry && styles.sorryInk]}>{info.title}</Text>
      <Text style={[styles.rank, sorry && styles.sorryInk, compact && styles.rankCompact]}>
        {info.title}
      </Text>
      <Text style={[styles.detail, compact && styles.detailCompact]}>{info.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    backgroundColor: '#fffaf0',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e4d3b0',
    padding: 12,
    justifyContent: 'space-between',
  },
  full: { width: 168, height: 228 },
  compact: { width: 132, minHeight: 176, height: 188 },
  back: {
    backgroundColor: '#1b4d3e',
    borderColor: '#d4a84b',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  diamond: {
    width: 36,
    height: 36,
    backgroundColor: '#d4a84b',
    transform: [{ rotate: '45deg' }],
  },
  backLabel: {
    color: '#f6ead2',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  sorryFace: { borderColor: '#d64545' },
  corner: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    color: '#2a2118',
  },
  rank: {
    fontFamily: fonts.display,
    fontSize: 64,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2a2118',
  },
  rankCompact: { fontSize: 42 },
  sorryInk: { color: '#d64545' },
  detail: {
    color: '#5c5144',
    fontSize: 13,
    lineHeight: 18,
  },
  detailCompact: { fontSize: 12, lineHeight: 16 },
});

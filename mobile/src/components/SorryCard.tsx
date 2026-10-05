import { StyleSheet, Text, View } from 'react-native';
import { cardInfo, type CardKind } from '../domain/sorry';
import { fonts, radii } from '../theme';

type Props = {
  card: CardKind | 'back';
  compact?: boolean;
  mini?: boolean;
  /** Face-down cards in the deck say “Deck”. A turning card leaves the word off. */
  label?: boolean;
};

export function SorryCard({ card, compact, mini, label = true }: Props) {
  const size = mini ? styles.mini : compact ? styles.compact : styles.full;
  if (card === 'back') {
    return (
      <View style={[styles.face, styles.back, size, mini && styles.backMini]}>
        <View style={[styles.diamond, mini && styles.diamondMini]} />
        {label ? <Text style={[styles.backLabel, mini && styles.backLabelMini]}>Deck</Text> : null}
      </View>
    );
  }

  const info = cardInfo(card);
  const sorry = card === 'sorry';
  return (
    <View style={[styles.face, size, sorry && styles.sorryFace, mini && styles.faceMini]}>
      <Text style={[styles.corner, sorry && styles.sorryInk, mini && styles.cornerMini]}>{info.title}</Text>
      <Text style={[styles.rank, sorry && styles.sorryInk, compact && styles.rankCompact, mini && styles.rankMini]}>
        {info.title}
      </Text>
      <Text style={[styles.detail, compact && styles.detailCompact, mini && styles.detailMini]}>{info.detail}</Text>
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
  mini: { width: 118, height: 162 },
  faceMini: { padding: 8, borderRadius: 10 },
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
  diamondMini: { width: 24, height: 24 },
  backLabel: {
    color: '#f6ead2',
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  backMini: { gap: 8, borderRadius: 10 },
  backLabelMini: { fontSize: 12, letterSpacing: 0.6 },
  sorryFace: { borderColor: '#d64545' },
  corner: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700',
    color: '#2a2118',
  },
  cornerMini: { fontSize: 13 },
  rank: {
    fontFamily: fonts.display,
    fontSize: 64,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2a2118',
  },
  rankCompact: { fontSize: 42 },
  rankMini: { fontSize: 28 },
  sorryInk: { color: '#d64545' },
  detail: {
    color: '#5c5144',
    fontSize: 13,
    lineHeight: 18,
  },
  detailCompact: { fontSize: 12, lineHeight: 16 },
  detailMini: { fontSize: 11, lineHeight: 14 },
});

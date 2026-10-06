import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import type { Dice, Holds } from '../domain/yahtzee';
import { diceTotal } from '../domain/yahtzee';
import { colors, radii, space, typography } from '../theme';

const PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

export type RollOffer = { id: string; label: string; points: number };

type Props = {
  dice: Dice | null;
  held: Holds;
  rollsLeft: number;
  offers?: RollOffer[];
  onRoll: () => void;
  onToggleHold: (index: number) => void;
  onScore?: (id: string) => void;
};

export function YahtzeeDice({ dice, held, rollsLeft, offers = [], onRoll, onToggleHold, onScore }: Props) {
  const faces = dice ?? [0, 0, 0, 0, 0];
  const canHold = dice != null && rollsLeft > 0;
  const rollLabel = dice == null ? 'Roll' : `Roll again · ${rollsLeft} left`;
  const best = offers.reduce((top, offer) => Math.max(top, offer.points), 0);

  return (
    <View style={styles.tray}>
      <View style={styles.dice}>
        {faces.map((face, index) => {
          const keep = dice != null && held[index];
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={
                face === 0 ? 'Die not rolled' : `Die showing ${face}${keep ? ', kept' : ', tap to keep'}`
              }
              disabled={!canHold}
              onPress={() => onToggleHold(index)}
              style={styles.dieWrap}
            >
              <View style={[styles.die, keep && styles.kept]}>
                <View style={styles.pips}>
                  {(PIPS[face] ?? PIPS[1].map(() => false)).map((on, pip) => (
                    <View key={pip} style={styles.slot}>
                      {on ? <View style={styles.pip} /> : null}
                    </View>
                  ))}
                </View>
              </View>
              <Text style={styles.keep}>{keep ? 'Keep' : ' '}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.rollRow}>
        <Button
          label={rollLabel}
          variant="primary"
          onPress={onRoll}
          disabled={rollsLeft <= 0}
          style={styles.roll}
        />
        <Text style={styles.total}>{dice ? `Total ${diceTotal(dice)}` : 'Three rolls'}</Text>
      </View>
      {dice ? (
        <View style={styles.offers}>
          <Text style={styles.offerLabel}>{offers.length > 0 ? 'Score this roll' : 'Nothing scores'}</Text>
          {offers.length > 0 ? (
            <View style={styles.offerRow}>
              {offers.map((offer) => {
                const top = offer.points === best;
                return (
                  <Pressable
                    key={offer.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Score ${offer.label} for ${offer.points}`}
                    onPress={() => onScore?.(offer.id)}
                    style={[styles.offer, top && styles.offerBest]}
                  >
                    <Text style={[styles.offerName, top && styles.offerNameBest]}>{offer.label}</Text>
                    <Text style={[styles.offerPoints, top && styles.offerPointsBest]}>{offer.points}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.offerEmpty}>Scratch a box on the card, or roll again.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.md,
    gap: 10,
  },
  dice: { flexDirection: 'row', gap: 8 },
  dieWrap: { flex: 1, maxWidth: 72, alignItems: 'center', gap: 4 },
  die: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#f6f0e3',
    borderWidth: 6,
    borderColor: '#f6f0e3',
  },
  kept: { borderColor: colors.accent },
  pips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 2 },
  slot: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
  pip: { width: '78%', height: '78%', borderRadius: 999, backgroundColor: '#241c14' },
  keep: { ...typography.body, fontSize: 11, fontWeight: '700', color: colors.accent, minHeight: 14 },
  rollRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roll: { flex: 1 },
  total: { ...typography.label, minWidth: 72, textAlign: 'right' },
  offers: { gap: 8 },
  offerLabel: {
    ...typography.section,
    color: colors.accent,
  },
  offerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.45)',
  },
  offerBest: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  offerName: { ...typography.label, color: colors.text },
  offerNameBest: { color: colors.accentText },
  offerPoints: {
    ...typography.label,
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  offerPointsBest: { color: colors.accentText },
  offerEmpty: { ...typography.body, fontSize: 13 },
});

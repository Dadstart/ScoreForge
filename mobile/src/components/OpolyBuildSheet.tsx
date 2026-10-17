import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { PropertyMentions, PropertyName } from './PropertyMention';
import { formatMoney, type BoardProperty } from '../domain/opoly';
import {
  buildingCost,
  canBuild,
  canMortgage,
  canSellBuilding,
  groupBuildCost,
  groupBuildTargets,
  mortgageValue,
  unmortgageCost,
  type OpolyPlay,
} from '../domain/opolyPlay';
import { colors, radii, typography } from '../theme';

type Props = {
  visible: boolean;
  property: BoardProperty | null;
  play: OpolyPlay;
  cash: number;
  /** False while a debt or another decision is open, so houses cannot be bought. */
  canBuildNow: boolean;
  error?: string | null;
  onClose: () => void;
  onBuildOne: (propertyId: string) => void;
  onBuildGroup: (group: string) => void;
  onSell: (propertyId: string) => void;
  onMortgage: (propertyId: string) => void;
  onUnmortgage: (propertyId: string) => void;
};

function buildingStatus(level: number, mortgaged: boolean): string {
  if (mortgaged) return 'Mortgaged';
  if (level >= 5) return 'Hotel';
  if (level <= 0) return 'Undeveloped';
  return `${level} house${level === 1 ? '' : 's'}`;
}

export function OpolyBuildSheet({
  visible,
  property,
  play,
  cash,
  canBuildNow,
  error = null,
  onClose,
  onBuildOne,
  onBuildGroup,
  onSell,
  onMortgage,
  onUnmortgage,
}: Props) {
  if (!property) return null;

  const level = play.houses[property.id] ?? 0;
  const mortgaged = play.mortgaged.includes(property.id);
  const street = property.kind === 'street';
  const yours = play.owned[property.id] === play.turn;
  const oneCost = buildingCost(property.id);
  const canOne = canBuildNow && canBuild(play, property.id);
  const groupTargets = canBuildNow ? groupBuildTargets(play, property.group) : [];
  const groupCost = groupBuildCost(play, property.group);
  const canGroup = groupTargets.length > 0;
  const nextOne = level >= 4 ? 'hotel' : 'house';
  const nextGroup = groupTargets[0] && (play.houses[groupTargets[0].id] ?? 0) >= 4 ? 'hotel' : 'house';
  const groupCount = groupTargets.length;
  const groupUnit = nextGroup === 'hotel' ? (groupCount === 1 ? 'hotel' : 'hotels') : groupCount === 1 ? 'house' : 'houses';
  const canSell = canSellBuilding(play, property.id);
  const sellRefund = Math.floor(oneCost / 2);
  const sellingHotel = level >= 5;
  const canMortgageThis = yours && canMortgage(play, property.id);
  const mortgage = mortgageValue(property.id);
  const liftCost = unmortgageCost(property.id);
  const canLift = yours && mortgaged && play.pending == null && play.doubles === 0;
  const housesBlockMortgage = yours && street && !mortgaged && !canMortgage(play, property.id);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss property" />
        <View style={styles.sheet}>
          <Text style={styles.title}>
            <PropertyName name={property.name} swatch={property.swatch} />
          </Text>
          <Text style={styles.meta}>{`${property.group} · ${buildingStatus(level, mortgaged)}`}</Text>

          {canOne || canGroup ? (
            <Text style={styles.hint}>
              Houses must be built evenly across the color group. A hotel replaces four houses.
            </Text>
          ) : null}

          {canOne ? (
            <Button
              label={`Buy ${nextOne} · ${formatMoney(oneCost)}`}
              variant="primary"
              disabled={cash < oneCost}
              onPress={() => onBuildOne(property.id)}
            />
          ) : null}

          {canGroup ? (
            <Button
              label={`Buy ${groupCount} ${groupUnit} on all ${property.group} · ${formatMoney(groupCost)}`}
              disabled={cash < groupCost}
              onPress={() => onBuildGroup(property.group)}
            />
          ) : null}

          {canSell ? (
            <Button
              label={`Sell ${sellingHotel ? 'hotel' : 'house'} · ${formatMoney(sellRefund)}`}
              onPress={() => onSell(property.id)}
            />
          ) : null}
          {canSell && sellingHotel ? (
            <Text style={styles.meta}>Selling the hotel leaves four houses.</Text>
          ) : null}

          {canMortgageThis ? (
            <Button
              label={`Mortgage · ${formatMoney(mortgage)}`}
              onPress={() => onMortgage(property.id)}
            />
          ) : null}
          {housesBlockMortgage ? (
            <Text style={styles.meta}>Sell the houses on this color before mortgaging.</Text>
          ) : null}

          {canLift ? (
            <Button
              label={`Unmortgage · ${formatMoney(liftCost)}`}
              disabled={cash < liftCost}
              onPress={() => onUnmortgage(property.id)}
            />
          ) : null}

          {error ? <PropertyMentions text={error} style={styles.error} /> : null}

          <Button label="Close" onPress={onClose} style={styles.close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    gap: 12,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    textAlign: 'center',
  },
  meta: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  hint: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 4,
  },
  error: {
    ...typography.label,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  close: { alignSelf: 'stretch', marginTop: 4 },
});

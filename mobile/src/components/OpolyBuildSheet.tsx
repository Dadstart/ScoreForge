import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from './ui';
import { PropertyName } from './PropertyMention';
import { formatMoney, type BoardProperty } from '../domain/opoly';
import {
  buildingCost,
  canBuild,
  groupBuildCost,
  groupBuildTargets,
  type OpolyPlay,
} from '../domain/opolyPlay';
import { colors, radii, typography } from '../theme';

type Props = {
  visible: boolean;
  property: BoardProperty | null;
  play: OpolyPlay;
  cash: number;
  disabled?: boolean;
  onClose: () => void;
  onBuildOne: (propertyId: string) => void;
  onBuildGroup: (group: string) => void;
};

function buildingStatus(level: number): string {
  if (level >= 5) return 'Hotel';
  if (level <= 0) return 'Undeveloped';
  return `${level} house${level === 1 ? '' : 's'}`;
}

export function OpolyBuildSheet({
  visible,
  property,
  play,
  cash,
  disabled = false,
  onClose,
  onBuildOne,
  onBuildGroup,
}: Props) {
  if (!property) return null;

  const level = play.houses[property.id] ?? 0;
  const oneCost = buildingCost(property.id);
  const canOne = canBuild(play, property.id);
  const groupTargets = groupBuildTargets(play, property.group);
  const groupCost = groupBuildCost(play, property.group);
  const canGroup = groupTargets.length > 0;
  const nextOne = level >= 4 ? 'hotel' : 'house';
  const nextGroup = groupTargets[0] && (play.houses[groupTargets[0].id] ?? 0) >= 4 ? 'hotel' : 'house';
  const groupCount = groupTargets.length;
  const groupUnit = nextGroup === 'hotel' ? (groupCount === 1 ? 'hotel' : 'hotels') : groupCount === 1 ? 'house' : 'houses';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss build" />
        <View style={styles.sheet}>
          <Text style={styles.title}>Build</Text>
          <Text style={styles.name}>
            <PropertyName name={property.name} swatch={property.swatch} />
          </Text>
          <Text style={styles.meta}>{`${property.group} · ${buildingStatus(level)}`}</Text>
          <Text style={styles.hint}>
            Houses must be built evenly across the color group. You can raise one eligible deed or every deed that is currently at the lowest level.
          </Text>

          <Button
            label={
              canOne
                ? `Buy ${nextOne} on ${property.name} · ${formatMoney(oneCost)}`
                : level >= 5
                  ? 'Hotel already built'
                  : 'Cannot build here yet'
            }
            variant="primary"
            disabled={disabled || !canOne || cash < oneCost}
            onPress={() => onBuildOne(property.id)}
          />

          <Button
            label={
              canGroup
                ? `Buy ${groupCount} ${groupUnit} on all ${property.group} · ${formatMoney(groupCost)}`
                : `Cannot build on ${property.group}`
            }
            disabled={disabled || !canGroup || cash < groupCost}
            onPress={() => onBuildGroup(property.group)}
          />

          {!canOne && !canGroup ? (
            <Text style={styles.meta}>Finish your move, own the full unmortgaged color set, and keep buildings even.</Text>
          ) : cash < Math.min(canOne ? oneCost : Infinity, canGroup ? groupCost : Infinity) ? (
            <Text style={styles.meta}>Not enough cash.</Text>
          ) : null}

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
  name: {
    ...typography.section,
    fontSize: 18,
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
  close: { alignSelf: 'stretch', marginTop: 4 },
});

import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OptionSelect } from './OptionSelect';
import { HeaderIconButton } from './HeaderIconButton';
import { Button, Field } from './ui';
import { formatMoney, playerLabel, properties, type BoardProperty } from '../domain/opoly';
import { cashOf, type OpolyPlay } from '../domain/opolyPlay';
import type { Player, ScoreEvent } from '../domain/models';
import { colors, radii, typography } from '../theme';

const BANK = '__bank__';

const BUILD_LEVELS = [
  { id: '0', label: 'None' },
  { id: '1', label: '1 house' },
  { id: '2', label: '2 houses' },
  { id: '3', label: '3 houses' },
  { id: '4', label: '4 houses' },
  { id: '5', label: 'Hotel' },
];

type Props = {
  players: Player[];
  events: ScoreEvent[];
  play: OpolyPlay;
  disabled?: boolean;
  onSetCash: (playerId: string, cash: number) => void | Promise<void>;
  onAssignProperty: (propertyId: string, ownerId: string | null) => void | Promise<void>;
  onAssignGroup: (group: string, ownerId: string | null) => void | Promise<void>;
  onSetBuilding: (propertyId: string, level: number) => void | Promise<void>;
  onGiveJailCard: (playerId: string, deck: 'chance' | 'chest') => void | Promise<void>;
  onReturnJailCard: (playerId: string, deck: 'chance' | 'chest') => void | Promise<void>;
};

function propertyGroups(): { id: string; label: string }[] {
  const seen = new Set<string>();
  const groups: { id: string; label: string }[] = [];
  for (const property of properties) {
    if (seen.has(property.group)) continue;
    seen.add(property.group);
    groups.push({ id: property.group, label: property.group });
  }
  return groups;
}

function ownerLabel(play: OpolyPlay, property: BoardProperty, players: Player[]): string {
  const ownerId = play.owned[property.id];
  if (!ownerId) return 'Bank';
  const owner = players.find((player) => player.id === ownerId);
  return owner ? playerLabel(owner.name, owner.token) : 'Owner';
}

function buildingLabel(level: number): string {
  if (level >= 5) return 'Hotel';
  if (level <= 0) return 'None';
  return `${level} house${level === 1 ? '' : 's'}`;
}

export function OpolyDebugMenu({
  players,
  events,
  play,
  disabled = false,
  onSetCash,
  onAssignProperty,
  onAssignGroup,
  onSetBuilding,
  onGiveJailCard,
  onReturnJailCard,
}: Props) {
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState(players[0]?.id ?? '');
  const [cashDraft, setCashDraft] = useState('');
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [groupId, setGroupId] = useState(propertyGroups()[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const groups = useMemo(() => propertyGroups(), []);
  const playerOptions = players.map((player) => ({
    id: player.id,
    label: playerLabel(player.name, player.token),
  }));
  const ownerOptions = [{ id: BANK, label: 'The Bank' }, ...playerOptions];
  const propertyOptions = properties.map((property) => ({
    id: property.id,
    label: `${property.name} · ${property.group} · ${ownerLabel(play, property, players)}`,
  }));

  const selectedPlayer = players.find((player) => player.id === playerId) ?? players[0];
  const currentCash = selectedPlayer ? cashOf(events, selectedPlayer.id) : 0;
  const selectedProperty = properties.find((entry) => entry.id === propertyId) ?? properties[0];
  const buildingLevel = selectedProperty ? play.houses[selectedProperty.id] ?? 0 : 0;
  const canBuildSelected = Boolean(selectedProperty && selectedProperty.kind === 'street' && play.owned[selectedProperty.id]);
  const chanceHeld = selectedPlayer ? play.chanceFree[selectedPlayer.id] ?? 0 : 0;
  const chestHeld = selectedPlayer ? play.chestFree[selectedPlayer.id] ?? 0 : 0;
  const chanceInDeck = play.chance.includes('jail-free');
  const chestInDeck = play.chest.includes('jail-free');

  const close = () => {
    setOpen(false);
    setMessage(null);
  };

  const openMenu = () => {
    const first = players[0]?.id ?? '';
    setPlayerId((current) => (players.some((player) => player.id === current) ? current : first));
    setCashDraft(String(cashOf(events, players.some((player) => player.id === playerId) ? playerId : first)));
    setMessage(null);
    setOpen(true);
  };

  const applyCash = async () => {
    if (!selectedPlayer || disabled) return;
    if (!/^-?\d+$/.test(cashDraft.trim())) {
      setMessage('Enter a whole dollar amount.');
      return;
    }
    const nextCash = Number(cashDraft.trim());
    if (!Number.isSafeInteger(nextCash)) {
      setMessage('Enter a whole dollar amount.');
      return;
    }
    await onSetCash(selectedPlayer.id, nextCash);
    setMessage(`Set ${playerLabel(selectedPlayer.name, selectedPlayer.token)} to ${formatMoney(nextCash)}.`);
  };

  const assignDeed = async (owner: string) => {
    if (disabled || !propertyId) return;
    const ownerId = owner === BANK ? null : owner;
    await onAssignProperty(propertyId, ownerId);
    const property = properties.find((entry) => entry.id === propertyId);
    const who =
      ownerId == null
        ? 'the bank'
        : playerLabel(
            players.find((player) => player.id === ownerId)?.name ?? 'player',
            players.find((player) => player.id === ownerId)?.token,
          );
    setMessage(`Assigned ${property?.name ?? propertyId} to ${who}.`);
  };

  const assignGroup = async (owner: string) => {
    if (disabled || !groupId) return;
    const ownerId = owner === BANK ? null : owner;
    await onAssignGroup(groupId, ownerId);
    const who =
      ownerId == null
        ? 'the bank'
        : playerLabel(
            players.find((player) => player.id === ownerId)?.name ?? 'player',
            players.find((player) => player.id === ownerId)?.token,
          );
    setMessage(`Assigned ${groupId} to ${who}.`);
  };

  const setBuilding = async (level: number) => {
    if (disabled || !propertyId) return;
    await onSetBuilding(propertyId, level);
    const property = properties.find((entry) => entry.id === propertyId);
    setMessage(`Set ${property?.name ?? propertyId} to ${buildingLabel(level)}.`);
  };

  if (players.length === 0) return null;

  return (
    <>
      <HeaderIconButton label="Debug" onPress={openMenu}>
        <Text style={styles.mark}>Dbg</Text>
      </HeaderIconButton>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss debug" />
          <View style={styles.sheet}>
            <Text style={styles.title}>Debug</Text>
            <Text style={styles.hint}>Assign cash, deeds, and buildings for manual testing. Dev builds only.</Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.section}>Cash</Text>
              <OptionSelect
                label="Player"
                value={selectedPlayer?.id ?? ''}
                options={playerOptions}
                onChange={(id) => {
                  setPlayerId(id);
                  setCashDraft(String(cashOf(events, id)));
                  setMessage(null);
                }}
                disabled={disabled}
              />
              <Text style={styles.meta}>{`Current: ${formatMoney(currentCash)}`}</Text>
              <Field
                value={cashDraft}
                onChangeText={(text) => {
                  setCashDraft(text.replace(/[^\d-]/g, ''));
                  setMessage(null);
                }}
                keyboardType="number-pad"
                placeholder="Cash"
                editable={!disabled}
                style={styles.field}
              />
              <View style={styles.row}>
                <Button label="Set cash" variant="primary" disabled={disabled} onPress={() => void applyCash()} />
                <Button
                  label="$1,500"
                  disabled={disabled || !selectedPlayer}
                  onPress={() => {
                    if (!selectedPlayer) return;
                    setCashDraft('1500');
                    void (async () => {
                      await onSetCash(selectedPlayer.id, 1500);
                      setMessage(
                        `Set ${playerLabel(selectedPlayer.name, selectedPlayer.token)} to ${formatMoney(1500)}.`,
                      );
                    })();
                  }}
                />
              </View>

              <Text style={styles.section}>Property</Text>
              <OptionSelect
                label="Deed"
                value={propertyId}
                options={propertyOptions}
                onChange={(id) => {
                  setPropertyId(id);
                  setMessage(null);
                }}
                disabled={disabled}
              />
              <OptionSelect
                label="Owner"
                value={play.owned[propertyId] ?? BANK}
                options={ownerOptions}
                onChange={(id) => void assignDeed(id)}
                disabled={disabled}
              />
              <View style={styles.row}>
                <Button
                  label="Give to player"
                  disabled={disabled || !selectedPlayer}
                  onPress={() => void assignDeed(selectedPlayer!.id)}
                />
                <Button label="Return to bank" disabled={disabled} onPress={() => void assignDeed(BANK)} />
              </View>

              <Text style={styles.section}>Color group</Text>
              <OptionSelect
                label="Group"
                value={groupId}
                options={groups}
                onChange={(id) => {
                  setGroupId(id);
                  setMessage(null);
                }}
                disabled={disabled}
              />
              <View style={styles.row}>
                <Button
                  label="Grant group"
                  variant="primary"
                  disabled={disabled || !selectedPlayer}
                  onPress={() => void assignGroup(selectedPlayer!.id)}
                />
                <Button label="Reclaim group" disabled={disabled} onPress={() => void assignGroup(BANK)} />
              </View>

              <Text style={styles.section}>Houses & hotels</Text>
              <Text style={styles.meta}>
                {canBuildSelected
                  ? `Current on ${selectedProperty?.name ?? 'deed'}: ${buildingLabel(buildingLevel)}`
                  : 'Pick an owned street deed to buy or sell buildings.'}
              </Text>
              <OptionSelect
                label="Level"
                value={String(buildingLevel)}
                options={BUILD_LEVELS}
                onChange={(id) => void setBuilding(Number(id))}
                disabled={disabled || !canBuildSelected}
              />
              <View style={styles.row}>
                <Button
                  label="Buy house"
                  variant="primary"
                  disabled={disabled || !canBuildSelected || buildingLevel >= 4}
                  onPress={() => void setBuilding(buildingLevel + 1)}
                />
                <Button
                  label="Buy hotel"
                  disabled={disabled || !canBuildSelected || buildingLevel >= 5}
                  onPress={() => void setBuilding(5)}
                />
                <Button
                  label="Sell"
                  disabled={disabled || !canBuildSelected || buildingLevel <= 0}
                  onPress={() => void setBuilding(buildingLevel - 1)}
                />
              </View>

              <Text style={styles.section}>Get Out of Jail Free</Text>
              <Text style={styles.meta}>
                {selectedPlayer
                  ? `${playerLabel(selectedPlayer.name, selectedPlayer.token)} holds Chance ×${chanceHeld}, Chest ×${chestHeld}.`
                  : 'Pick a player to grant or return a jail card.'}
              </Text>
              <View style={styles.row}>
                <Button
                  label="Give Chance card"
                  variant="primary"
                  disabled={disabled || !selectedPlayer || !chanceInDeck}
                  onPress={async () => {
                    if (!selectedPlayer) return;
                    await onGiveJailCard(selectedPlayer.id, 'chance');
                    setMessage(`Gave Chance Get Out of Jail Free to ${playerLabel(selectedPlayer.name, selectedPlayer.token)}.`);
                  }}
                />
                <Button
                  label="Return Chance"
                  disabled={disabled || !selectedPlayer || chanceHeld <= 0}
                  onPress={async () => {
                    if (!selectedPlayer) return;
                    await onReturnJailCard(selectedPlayer.id, 'chance');
                    setMessage('Returned Chance Get Out of Jail Free to the deck.');
                  }}
                />
              </View>
              <View style={styles.row}>
                <Button
                  label="Give Chest card"
                  variant="primary"
                  disabled={disabled || !selectedPlayer || !chestInDeck}
                  onPress={async () => {
                    if (!selectedPlayer) return;
                    await onGiveJailCard(selectedPlayer.id, 'chest');
                    setMessage(`Gave Chest Get Out of Jail Free to ${playerLabel(selectedPlayer.name, selectedPlayer.token)}.`);
                  }}
                />
                <Button
                  label="Return Chest"
                  disabled={disabled || !selectedPlayer || chestHeld <= 0}
                  onPress={async () => {
                    if (!selectedPlayer) return;
                    await onReturnJailCard(selectedPlayer.id, 'chest');
                    setMessage('Returned Chest Get Out of Jail Free to the deck.');
                  }}
                />
              </View>

              {message ? <Text style={styles.message}>{message}</Text> : null}
            </ScrollView>
            <Button label="Close" onPress={close} style={styles.close} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  mark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
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
    maxWidth: 420,
    maxHeight: '88%',
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
  },
  hint: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 18,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { gap: 10, paddingBottom: 4 },
  section: {
    ...typography.section,
    fontSize: 16,
    marginTop: 6,
  },
  meta: {
    ...typography.label,
    color: colors.textDim,
    fontSize: 13,
  },
  field: { alignSelf: 'stretch', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  message: {
    ...typography.label,
    color: colors.accent,
    fontSize: 13,
    lineHeight: 18,
  },
  close: { alignSelf: 'stretch' },
});

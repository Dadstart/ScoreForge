import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { MonopolyBoard } from '../components/MonopolyBoard';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { OptionSelect } from '../components/OptionSelect';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Card, Field, Screen } from '../components/ui';
import { withAddedPlayer, withoutPlayer } from '../domain/addPlayer';
import { findLocalPlayerId } from '../domain/localPlayer';
import { type Game, createScoreEvent } from '../domain/models';
import {
  BANK_PARTY_ID,
  RAILROAD_COUNTS,
  STARTING_CASH,
  STREET_LEVELS,
  UTILITY_COUNTS,
  cashFromDelta,
  formatMoney,
  getProperty,
  properties,
  quoteRent,
  transferEvents,
  withoutLastCashAction,
  type RailroadCount,
  type StreetLevel,
  type UtilityCount,
} from '../domain/monopoly';
import { getBoardSpace } from '../domain/monopolyBoard';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { useSettings } from '../hooks/useSettings';
import { useWinCelebration } from '../hooks/useWinCelebration';
import { loadDisplayName } from '../storage/displayNameStore';
import { saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Monopoly'>;

function parsePositiveAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

function parseDice(raw: string): number | null {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < 2 || value > 12) return null;
  return value;
}

export function MonopolyScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState(BANK_PARTY_ID);
  const [propertyId, setPropertyId] = useState(properties[0].id);
  const [streetLevel, setStreetLevel] = useState<StreetLevel>(0);
  const [railroadsOwned, setRailroadsOwned] = useState<RailroadCount>(1);
  const [utilitiesOwned, setUtilitiesOwned] = useState<UtilityCount>(1);
  const [dice, setDice] = useState('7');
  const [settings, updateSettings] = useSettings();
  const showBoard = settings.showMonopolyBoard;
  const [boardDragging, setBoardDragging] = useState(false);
  const [landNote, setLandNote] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [cashDraft, setCashDraft] = useState('');
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame(found);
        if (found) {
          const tmpl = getTemplate(found.templateId);
          if (tmpl) onSnapshot(calculate(found, tmpl));
        }
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId, onSnapshot]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );
  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName) : null),
    [game, displayName],
  );
  const knownParty = (id: string | null) =>
    id === BANK_PARTY_ID || (game?.players.some((player) => player.id === id) ?? false);
  const resolvedPayer =
    payerId && knownParty(payerId)
      ? payerId
      : localPlayerId ?? game?.players[0]?.id ?? BANK_PARTY_ID;
  const resolvedReceiver = knownParty(receiverId) ? receiverId : BANK_PARTY_ID;
  const property = getProperty(propertyId) ?? properties[0];
  const diceTotal = parseDice(dice);
  const rent = useMemo(
    () =>
      quoteRent({
        propertyId,
        streetLevel,
        railroadsOwned,
        utilitiesOwned,
        dice: diceTotal ?? 0,
      }),
    [propertyId, streetLevel, railroadsOwned, utilitiesOwned, diceTotal],
  );

  const persist = async (next: Game) => {
    await saveGame(next);
    setGame(next);
  };

  if (!game || !template || !snapshot) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const complete = snapshot.isComplete;
  const localPlayer = game.players.find((player) => player.id === localPlayerId) ?? null;
  const canBank = !complete;
  const sameParty = resolvedPayer === resolvedReceiver;

  const applyGame = async (mutator: (g: Game) => Game, opts?: { suppressWin?: boolean }) => {
    const next = mutator({
      ...game,
      players: [...game.players],
      events: [...game.events],
    });
    const snap = calculate(next, template);
    if (snap.isComplete) next.status = 'Completed';
    else if (next.status === 'Completed' && !snap.isComplete) next.status = 'InProgress';

    if (opts?.suppressWin || !snap.isComplete) {
      beginSuppress();
      try {
        noteLocalResult(snap);
        await persist(next);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Autosave failed');
      } finally {
        endSuppress(snap.isComplete);
      }
      return;
    }

    noteLocalResult(snap);
    try {
      await persist(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Autosave failed');
    }
  };

  const partyName = (id: string) =>
    id === BANK_PARTY_ID ? 'The Bank' : game.players.find((player) => player.id === id)?.name ?? 'Player';

  const transfer = async (value: number) => {
    if (!canBank || value <= 0) return;
    if (sameParty) {
      setError('Choose a different payer and receiver.');
      return;
    }
    const legs = transferEvents(resolvedPayer, resolvedReceiver, value);
    if (legs.length === 0) return;
    await applyGame((g) => {
      g.events.push(...legs);
      return g;
    });
  };

  const applyAmount = async () => {
    const value = parsePositiveAmount(amount);
    if (value == null) {
      setError('Enter a whole dollar amount greater than zero.');
      return;
    }
    await transfer(value);
    setAmount('');
  };

  const applyRent = async () => {
    if (!rent) {
      setError(
        property.kind === 'utility'
          ? 'Enter a dice total from 2 to 12.'
          : 'Choose a property to look up rent.',
      );
      return;
    }
    await transfer(rent.amount);
  };

  const placePiece = (playerId: string, spaceIndex: number) => {
    const space = getBoardSpace(spaceIndex);
    const player = game.players.find((entry) => entry.id === playerId);
    if (!space || !player || !canBank) return;
    void applyGame(
      (g) => {
        g.tokenSpaces = { ...(g.tokenSpaces ?? {}), [playerId]: spaceIndex };
        return g;
      },
      { suppressWin: true },
    );
    if (space.propertyId) {
      setPropertyId(space.propertyId);
      setPayerId(playerId);
      setLandNote(`${player.name} landed on ${space.name}. Rent property is set.`);
      return;
    }
    if (space.tax) {
      setAmount(String(space.tax));
      setPayerId(playerId);
      setReceiverId(BANK_PARTY_ID);
      setError(null);
      setLandNote(
        `${player.name} landed on ${space.name}. ${formatMoney(space.tax)} is in Adjust cash.`,
      );
      return;
    }
    setLandNote(`${player.name} moved to ${space.name}.`);
  };

  const beginPlayerEdit = (playerId: string, name: string, cash: number) => {
    setEditingPlayerId(playerId);
    setNameDraft(name);
    setCashDraft(String(cash));
    setError(null);
  };

  const savePlayerEdit = async (): Promise<boolean> => {
    if (!editingPlayerId || !canBank) return false;
    const playerId = editingPlayerId;
    const standing = snapshot.standings.find((entry) => entry.playerId === playerId);
    if (!standing) {
      setEditingPlayerId(null);
      return false;
    }
    if (!/^-?\d+$/.test(cashDraft)) {
      setError('Enter a whole dollar amount.');
      return false;
    }
    const nextCash = Number(cashDraft);
    if (!Number.isSafeInteger(nextCash)) {
      setError('Enter a whole dollar amount.');
      return false;
    }
    const name = nameDraft.trim();
    const delta = nextCash - cashFromDelta(standing.total);
    await applyGame(
      (g) => {
        g.players = g.players.map((player) =>
          player.id === playerId ? { ...player, name: name || player.name } : player,
        );
        if (delta !== 0) g.events.push(createScoreEvent(playerId, delta));
        return g;
      },
      { suppressWin: true },
    );
    setEditingPlayerId(null);
    return true;
  };

  const banner = complete
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins with the most cash`
      : 'Game complete'
    : localPlayer
      ? `Playing as ${localPlayer.name} · Everyone starts with ${formatMoney(STARTING_CASH)}`
      : `Everyone starts with ${formatMoney(STARTING_CASH)}`;

  const partyOptions = [
    { id: BANK_PARTY_ID, label: 'The Bank' },
    ...game.players.map((player) => ({
      id: player.id,
      label: player.id === localPlayerId ? `${player.name} (you)` : player.name,
    })),
  ];

  const parsedAmount = parsePositiveAmount(amount);
  const paymentPreview = sameParty
    ? 'Choose a different payer and receiver.'
    : null;

  const developmentOptions =
    property.kind === 'railroad'
      ? RAILROAD_COUNTS.map((entry) => ({ id: String(entry.id), label: entry.label }))
      : property.kind === 'utility'
        ? UTILITY_COUNTS.map((entry) => ({ id: String(entry.id), label: entry.label }))
        : STREET_LEVELS.map((entry) => ({ id: String(entry.id), label: entry.label }));

  const developmentValue =
    property.kind === 'railroad'
      ? String(railroadsOwned)
      : property.kind === 'utility'
        ? String(utilitiesOwned)
        : String(streetLevel);

  const developmentLabel =
    property.kind === 'railroad'
      ? 'Railroads owned'
      : property.kind === 'utility'
        ? 'Utilities owned'
        : 'Houses / hotel';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!boardDragging}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Monopoly" tone="accent" />
          </View>
          <ShareCodePanel shareCode={game.shareCode} />
          <Button label="Home" variant="ghost" onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Button
            label="Undo"
            onPress={() =>
              void applyGame(
                (g) => {
                  g.events = withoutLastCashAction(g.events);
                  return g;
                },
                { suppressWin: true },
              )
            }
            disabled={game.events.length === 0}
          />
          <Button
            label="Reset"
            onPress={() =>
              void applyGame(
                (g) => {
                  g.events = [];
                  g.status = 'InProgress';
                  g.tokenSpaces = {};
                  return g;
                },
                { suppressWin: true },
              )
            }
          />
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
          {!complete ? (
            <Button
              label={showBoard ? 'Hide board' : 'Show board'}
              onPress={() => updateSettings({ showMonopolyBoard: !showBoard })}
            />
          ) : null}
          <Button label="Settings" variant="ghost" onPress={() => navigation.navigate('Settings')} />
          {!complete ? (
            <Button
              label="Mark complete"
              onPress={() =>
                void applyGame((g) => {
                  g.status = 'Completed';
                  return g;
                })
              }
            />
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {showBoard ? (
          <View style={{ gap: 8 }}>
            <MonopolyBoard
              players={game.players}
              tokenSpaces={game.tokenSpaces}
              enabled={canBank}
              onDragging={setBoardDragging}
              onLand={(playerId, space) => placePiece(playerId, space.index)}
            />
            {landNote ? <Text style={styles.bannerText}>{landNote}</Text> : null}
          </View>
        ) : null}

        <View style={styles.wrap}>
          {snapshot.standings.map((standing) => {
            const cash = cashFromDelta(standing.total);
            const isYou = standing.playerId === localPlayerId;
            const broke = cash <= 0;
            const editing = editingPlayerId === standing.playerId;
            const cashTotals = snapshot.standings.map((entry) => entry.total);
            const highestCash = Math.max(...cashTotals);
            const lowestCash = Math.min(...cashTotals);
            const isPoorest = standing.total === lowestCash && lowestCash < highestCash;
            return (
              <View
                key={standing.playerId}
                style={[
                  styles.cashCard,
                  isYou ? styles.cashCardYou : styles.cashCardOther,
                  canBank && styles.cashCardEditable,
                ]}
              >
                {canBank ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={editing ? `Save ${standing.playerName}` : `Edit ${standing.playerName}`}
                    onPress={() => {
                      if (editing) {
                        void savePlayerEdit();
                        return;
                      }
                      const openNext = () => beginPlayerEdit(standing.playerId, standing.playerName, cash);
                      if (editingPlayerId) {
                        void savePlayerEdit().then((saved) => {
                          if (saved) openNext();
                        });
                        return;
                      }
                      openNext();
                    }}
                    style={styles.editBtn}
                  >
                    {editing ? <CheckIcon /> : <PencilIcon />}
                  </Pressable>
                ) : null}
                {editing ? (
                  <Field
                    value={nameDraft}
                    onChangeText={setNameDraft}
                    placeholder="Name"
                    autoFocus
                    style={styles.editField}
                  />
                ) : (
                  <Text style={styles.cardTitle}>
                    {standing.playerName}
                    {isYou ? ' · you' : ''}
                  </Text>
                )}
                {editing ? (
                  <Field
                    value={cashDraft}
                    onChangeText={(text) => setCashDraft(sanitizeCashInput(text))}
                    keyboardType="numbers-and-punctuation"
                    placeholder="Cash"
                    style={[styles.editField, styles.editCash]}
                  />
                ) : (
                  <Text style={[styles.cash, broke && { color: colors.danger }]}>{formatMoney(cash)}</Text>
                )}
                {broke ? <Badge label="Bankrupt" tone="danger" style={styles.tileBadge} /> : null}
                {standing.isLeader && !broke ? (
                  <Badge label="Richest" tone="accent" style={styles.tileBadge} />
                ) : null}
                {isPoorest ? <Badge label="Poorest" style={styles.tileBadge} /> : null}
                {standing.isWinner ? <Badge label="Winner" tone="success" style={styles.tileBadge} /> : null}
                {game.players.length > 1 && !complete ? (
                  <Button
                    label="Remove"
                    variant="ghost"
                    onPress={() => {
                      Alert.alert(
                        'Remove player',
                        `Remove ${standing.playerName} from this game?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Remove',
                            style: 'destructive',
                            onPress: () => {
                              void applyGame(
                                (g) => withoutPlayer(g, standing.playerId),
                                { suppressWin: true },
                              );
                            },
                          },
                        ],
                      );
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <Card>
          <Text style={typography.section}>Payment</Text>
          <Text style={typography.body}>
            Choose who pays and who receives. The bank is where money comes from for passing Go, and where it goes for taxes or buying property.
          </Text>
          <OptionSelect
            label="Paying"
            value={resolvedPayer}
            disabled={!canBank}
            options={partyOptions}
            onChange={setPayerId}
          />
          <OptionSelect
            label="Receiving"
            value={resolvedReceiver}
            disabled={!canBank}
            options={partyOptions}
            onChange={setReceiverId}
          />
          {paymentPreview ? <Text style={styles.error}>{paymentPreview}</Text> : null}
        </Card>

        <Card>
          <Text style={typography.section}>Adjust cash</Text>
          <Text style={typography.body}>
            Any amount — Chance, Community Chest, or a sale between players.
          </Text>
          <Field
            value={amount}
            onChangeText={(text) => {
              setAmount(text.replace(/[^\d]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="Amount"
            editable={canBank}
          />
          <Button
            label={
              parsedAmount
                ? `${partyName(resolvedPayer)} pays ${partyName(resolvedReceiver)} ${formatMoney(parsedAmount)}`
                : 'Transfer'
            }
            variant="primary"
            disabled={!canBank || !parsedAmount || sameParty}
            onPress={() => void applyAmount()}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>

        <Card>
          <Text style={typography.section}>Rent</Text>
          <Text style={typography.body}>
            Pick the property and how it is built, then charge that rent from the payer to the receiver.
          </Text>
          <OptionSelect
            label="Property"
            value={property.id}
            disabled={!canBank}
            options={properties.map((entry) => ({
              id: entry.id,
              label: entry.name,
              swatch: entry.swatch,
              group: entry.group,
            }))}
            onChange={setPropertyId}
          />
          <OptionSelect
            label={developmentLabel}
            value={developmentValue}
            disabled={!canBank}
            options={developmentOptions}
            onChange={(id) => {
              const next = Number(id);
              if (property.kind === 'railroad') setRailroadsOwned(next as RailroadCount);
              else if (property.kind === 'utility') setUtilitiesOwned(next as UtilityCount);
              else setStreetLevel(next as StreetLevel);
            }}
          />
          {property.kind === 'utility' ? (
            <View style={{ gap: 6 }}>
              <Text style={typography.section}>Dice total</Text>
              <Field
                value={dice}
                onChangeText={(text) => {
                  setDice(text.replace(/[^\d]/g, ''));
                  setError(null);
                }}
                keyboardType="number-pad"
                placeholder="2–12"
                editable={canBank}
              />
            </View>
          ) : null}
          <Text style={styles.rentPreview}>
            {rent ? `${rent.summary} · ${formatMoney(rent.amount)}` : 'Enter a dice total from 2 to 12'}
          </Text>
          <Button
            label={
              rent
                ? `${partyName(resolvedPayer)} pays ${partyName(resolvedReceiver)} ${formatMoney(rent.amount)}`
                : 'Charge rent'
            }
            variant="primary"
            disabled={!canBank || !rent || sameParty}
            onPress={() => void applyRent()}
            style={{ alignSelf: 'stretch' }}
          />
        </Card>
      </ScrollView>

      {showCelebration ? (
        <FireworksOverlay
          winnerName={snapshot.winnerName}
          subtitle="Monopoly"
          onDismiss={dismissCelebration}
        />
      ) : null}

      <AddPlayerModal
        visible={addingPlayer}
        maxPlayers={template.maxPlayers}
        currentCount={game.players.length}
        onCancel={() => setAddingPlayer(false)}
        onAdd={async (name) => {
          const next = withAddedPlayer(game, name, template.maxPlayers);
          await persist(next);
          setError(null);
        }}
      />
    </Screen>
  );
}

function sanitizeCashInput(text: string): string {
  const negative = text.trim().startsWith('-');
  const digits = text.replace(/\D/g, '');
  return negative ? `-${digits}` : digits;
}

function PencilIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        fill={colors.accent}
      />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" fill={colors.accent} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  banner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 14,
    borderRadius: radii.md,
  },
  bannerText: {
    ...typography.label,
    fontSize: 15,
    color: colors.text,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { color: colors.danger },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cashCard: {
    width: 168,
    borderWidth: 1.5,
    borderRadius: radii.lg,
    padding: 14,
    alignItems: 'center',
    backgroundColor: colors.surface,
    gap: 8,
  },
  cashCardYou: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  cashCardOther: { borderColor: colors.border },
  cashCardEditable: { paddingTop: 36 },
  cardTitle: {
    ...typography.label,
    fontSize: 15,
    textAlign: 'center',
  },
  cash: {
    ...typography.score,
    fontSize: 28,
  },
  editBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editField: {
    alignSelf: 'stretch',
    minHeight: 40,
    paddingVertical: 8,
    textAlign: 'center',
  },
  editCash: {
    fontSize: 22,
    fontWeight: '800',
  },
  tileBadge: { alignSelf: 'center' },
  rentPreview: {
    ...typography.label,
    fontSize: 16,
    color: colors.accent,
  },
});

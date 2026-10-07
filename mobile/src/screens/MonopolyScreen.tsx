import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AddPlayerModal } from '../components/AddPlayerModal';
import { MonopolyBoard, type TokenRouteView } from '../components/MonopolyBoard';
import { type MoneyFlight } from '../components/MoneyBills';
import { FireworksOverlay } from '../components/FireworksOverlay';
import { PlaySpark } from '../components/PlaySpark';
import { OptionSelect } from '../components/OptionSelect';
import { TokenPicker } from '../components/TokenPicker';
import { GameHelp } from '../components/GameHelp';
import { HomeButton } from '../components/HomeButton';
import { ShareCodePanel } from '../components/ShareCodePanel';
import { Badge, Button, Card, Field, Screen, usePageScroll } from '../components/ui';
import { withoutPlayer } from '../domain/addPlayer';
import { findLocalPlayerId } from '../domain/localPlayer';
import { type Game, createScoreEvent } from '../domain/models';
import {
  BANK_PARTY_ID,
  cashFromDelta,
  formatMoney,
  getProperty,
  playerToken,
  properties,
  singleEmoji,
  transferEvents,
  withoutLastCashAction,
} from '../domain/monopoly';
import { diceMotionMs } from '../components/MonopolyDice';
import { rollMonopolyDice, type DiceRoll } from '../domain/monopolyDice';
import {
  buildHouse,
  buildingCost,
  buyProperty,
  canBuild,
  canMortgage,
  canSellBuilding,
  cashOf,
  createMonopolyPlay,
  declineProperty,
  moneyFromSquare,
  mortgageProperty,
  mortgageValue,
  payToLeaveJail,
  rentDue,
  resolveRoll,
  sellBuilding,
  turnPrompt,
  undoForCash,
  undoMonopoly,
  unmortgageCost,
  unmortgageProperty,
  useJailCard,
  type PlayOutcome,
} from '../domain/monopolyPlay';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate } from '../domain/templates';
import { usePlaySpark } from '../hooks/usePlaySpark';
import { useWinCelebration } from '../hooks/useWinCelebration';
import { loadDisplayName } from '../storage/displayNameStore';
import { addPlayerToGame, preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { colors, radii, space, typography } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Monopoly'>;

const INITIAL_TOKEN = 'initial';

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

function isPlay(result: PlayOutcome | { error: string }): result is PlayOutcome {
  return !('error' in result);
}

export function MonopolyScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gameId } = route.params;
  const [game, setGame] = useState<Game | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [payerId, setPayerId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState(BANK_PARTY_ID);
  const [propertyId, setPropertyId] = useState(properties[0].id);
  const [dice, setDice] = useState('7');
  const [diceRoll, setDiceRoll] = useState<{ id: number; faces: [number, number] } | null>(null);
  const [tokenRoute, setTokenRoute] = useState<TokenRouteView | null>(null);
  const [moneyFlight, setMoneyFlight] = useState<MoneyFlight | null>(null);
  const routeSerial = useRef(0);
  const billSerial = useRef(0);
  const [rollingDice, setRollingDice] = useState(false);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [boardDragging, setBoardDragging] = useState(false);
  usePageScroll(!boardDragging);
  const [landNote, setLandNote] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [cashDraft, setCashDraft] = useState('');
  const [tokenDraft, setTokenDraft] = useState(INITIAL_TOKEN);
  const [emojiDraft, setEmojiDraft] = useState('');
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();
  const { sparks, spark } = usePlaySpark();
  const seenTokens = useRef<Record<string, number> | null>(null);
  const rollRef = useRef<(rolled: DiceRoll) => void>(() => {});

  useEffect(() => {
    return () => {
      if (rollTimer.current) clearTimeout(rollTimer.current);
    };
  }, []);

  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);

  useEffect(() => {
    const unsub = subscribeGame(
      gameId,
      (found) => {
        setGame((current) => (found ? preferNewerGame(current, found) : null));
        if (found) {
          const tmpl = getTemplate(found.templateId);
          if (tmpl) onSnapshot(calculate(found, tmpl));
        }
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, [gameId, onSnapshot]);

  useEffect(() => {
    if (!game) return;
    const spaces = game.tokenSpaces ?? {};
    const prior = seenTokens.current;
    seenTokens.current = spaces;
    if (!prior) return;
    const reachedGo = Object.entries(spaces).some(
      ([id, index]) => index === 0 && prior[id] != null && prior[id] !== 0,
    );
    if (reachedGo) spark('Go!', 'gold');
  }, [game, spark]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );
  const play = useMemo(() => {
    if (!game) return null;
    return game.monopoly ?? createMonopolyPlay(game.players.map((player) => player.id));
  }, [game]);
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

  const persist = async (next: Game) => {
    const saved = await saveGame(next);
    setGame((current) => preferNewerGame(current, saved));
  };

  if (!game || !template || !snapshot || !play) {
    return (
      <Screen>
        <View style={styles.center}>
          {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
        </View>
      </Screen>
    );
  }

  const complete = snapshot.isComplete;
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
      if (g.monopoly) g.monopoly = undoForCash(g.monopoly, g.tokenSpaces ?? {}, legs.length);
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

  const commitPlay = async (result: PlayOutcome | { error: string }) => {
    if (!isPlay(result)) {
      setError(result.error);
      return;
    }
    setLandNote(result.note);
    let routeId: number | null = null;
    if (result.route && result.route.spaces.length > 1) {
      routeSerial.current += 1;
      routeId = routeSerial.current;
      setTokenRoute({ id: routeId, playerId: result.route.playerId, spaces: result.route.spaces });
    }
    const paidSpace = moneyFromSquare(play, result);
    if (paidSpace != null) {
      billSerial.current += 1;
      const payer = result.events.find((event) => event.points < 0)?.playerId ?? play.turn;
      setMoneyFlight({ id: billSerial.current, playerId: payer, space: paidSpace, routeId });
    }
    await applyGame(
      (g) => {
        g.monopoly = result.play;
        g.tokenSpaces = result.tokens;
        g.events.push(...result.events);
        return g;
      },
      { suppressWin: true },
    );
  };

  const turnId = play?.turn ?? game.players[0]?.id ?? '';
  const turnPlayer = game.players.find((player) => player.id === turnId) ?? null;
  const inJail = play?.jail[turnId] != null;
  const turnCash = cashOf(game.events, turnId);

  rollRef.current = (rolled: DiceRoll) => {
    if (!play || play.pending) return;
    const result = resolveRoll(play, game.tokenSpaces ?? {}, game.players, rolled);
    void commitPlay(result);
  };

  const rollForPlayer = () => {
    if (!canBank || rollingDice || !play || play.pending || !turnPlayer) return;
    const rolled = rollMonopolyDice();
    setDice(String(rolled.total));
    setDiceRoll({ id: Date.now(), faces: rolled.faces });
    setRollingDice(true);
    setError(null);
    if (rollTimer.current) clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => {
      rollRef.current(rolled);
      setRollingDice(false);
    }, diceMotionMs());
  };

  const beginPlayerEdit = (playerId: string, name: string, cash: number, token?: string | null) => {
    setEditingPlayerId(playerId);
    setNameDraft(name);
    setCashDraft(String(cash));
    const piece = playerToken(token);
    setTokenDraft(piece?.id ?? INITIAL_TOKEN);
    setEmojiDraft(piece && piece.label === 'Custom' ? piece.emoji : '');
    setConfirmingRemoveId(null);
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
    const typed = emojiDraft.trim();
    const typedEmoji = typed ? singleEmoji(typed) : null;
    if (typed && !typedEmoji) {
      setError('Enter one emoji.');
      return false;
    }
    const token = playerToken(typedEmoji ?? tokenDraft)?.id ?? null;
    const mark = playerToken(token)?.emoji;
    const taken = game.players.some(
      (player) => player.id !== playerId && playerToken(player.token)?.emoji === mark,
    );
    if (mark && taken) {
      setError('That piece is already taken.');
      return false;
    }
    const delta = nextCash - cashFromDelta(standing.total);
    await applyGame(
      (g) => {
        g.players = g.players.map((player) =>
          player.id === playerId ? { ...player, name: name || player.name, token } : player,
        );
        if (delta !== 0) {
          g.events.push(createScoreEvent(playerId, delta));
          if (g.monopoly) g.monopoly = undoForCash(g.monopoly, g.tokenSpaces ?? {}, 1);
        }
        return g;
      },
      { suppressWin: true },
    );
    setEditingPlayerId(null);
    setConfirmingRemoveId(null);
    return true;
  };

  const banner = complete
    ? snapshot.winnerName
      ? `${snapshot.winnerName} wins with the most cash`
      : 'Game complete'
    : turnPrompt(play, game.players);

  const partyOptions = [
    { id: BANK_PARTY_ID, label: 'The Bank' },
    ...game.players.map((player) => ({
      id: player.id,
      label: player.id === localPlayerId ? `${player.name} (you)` : player.name,
    })),
  ];

  const parsedAmount = parsePositiveAmount(amount);
  const paymentPreview = sameParty ? 'Choose a different payer and receiver.' : null;

  const takenTokens = game.players
    .filter((player) => player.id !== editingPlayerId)
    .map((player) => playerToken(player.token)?.emoji)
    .filter((emoji): emoji is string => Boolean(emoji));

  const ownedDeeds = properties.filter((entry) => play.owned[entry.id]);
  const pendingProperty = play.pending ? getProperty(play.pending.propertyId) : undefined;
  const jailCards = (play.chanceFree[turnId] ?? 0) + (play.chestFree[turnId] ?? 0);
  const canDevelop = canBank && !play.pending && play.doubles === 0;
  const quoteDice = diceTotal ?? 7;
  const quoteOwner = play.owned[property.id];
  const quoteRentAmount = quoteOwner ? rentDue(play, property.id, quoteDice) : null;

  return (
    <Screen>
      <View
        style={[
          styles.content,
          {
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={typography.title}>{game.name}</Text>
            <Badge label="Monopoly" tone="accent" />
          </View>
          <GameHelp templateId="monopoly" />
          <ShareCodePanel shareCode={game.shareCode} />
          <HomeButton onPress={() => navigation.navigate('Home')} />
        </View>

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>

        <View style={styles.row}>
          <Button
            label="Undo"
            onPress={() => {
              setMoneyFlight(null);
              void applyGame(
                (g) => {
                  if (g.monopoly?.undo) {
                    const restored = undoMonopoly(g.monopoly, g.events);
                    if (restored) {
                      g.monopoly = restored.play;
                      g.tokenSpaces = restored.tokens;
                      g.events = restored.events;
                      return g;
                    }
                  }
                  g.events = withoutLastCashAction(g.events);
                  return g;
                },
                { suppressWin: true },
              );
            }}
            disabled={!play.undo && game.events.length === 0}
          />
          <Button
            label={rollingDice ? 'Rolling…' : inJail ? 'Roll for doubles' : `Roll for ${turnPlayer?.name ?? 'player'}`}
            variant="primary"
            disabled={!canBank || rollingDice || play.pending != null || !turnPlayer}
            onPress={rollForPlayer}
          />
          {play.pending && pendingProperty ? (
            <>
              <Button
                label={`Buy ${formatMoney(pendingProperty.price)}`}
                variant="primary"
                disabled={!canBank || turnCash < pendingProperty.price}
                onPress={() => void commitPlay(buyProperty(play, game.tokenSpaces ?? {}, game.players, turnCash))}
              />
              <Button
                label="No thanks"
                disabled={!canBank}
                onPress={() => void commitPlay(declineProperty(play, game.tokenSpaces ?? {}, game.players))}
              />
            </>
          ) : null}
          {inJail && !play.pending ? (
            <>
              <Button
                label="Pay $50"
                disabled={!canBank || turnCash < 50}
                onPress={() => void commitPlay(payToLeaveJail(play, game.tokenSpaces ?? {}, game.players, turnCash))}
              />
              {jailCards > 0 ? (
                <Button
                  label="Use Get Out of Jail Free"
                  disabled={!canBank}
                  onPress={() => void commitPlay(useJailCard(play, game.tokenSpaces ?? {}, game.players))}
                />
              ) : null}
            </>
          ) : null}
          {game.players.length < template.maxPlayers ? (
            <Button label="Add player" onPress={() => setAddingPlayer(true)} />
          ) : null}
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

        <View style={{ gap: 8 }}>
          <MonopolyBoard
            players={game.players}
            tokenSpaces={game.tokenSpaces}
            tokenRoute={tokenRoute}
            moneyFlight={moneyFlight}
            enabled={canBank}
            onDragging={setBoardDragging}
            onLand={(playerId, space) => {
              const before = { ...(game.tokenSpaces ?? {}) };
              void applyGame(
                (g) => {
                  g.tokenSpaces = { ...(g.tokenSpaces ?? {}), [playerId]: space.index };
                  if (g.monopoly) g.monopoly = undoForCash(g.monopoly, before, 0);
                  return g;
                },
                { suppressWin: true },
              );
            }}
            diceRoll={diceRoll}
          />
          {landNote ? <Text style={styles.bannerText}>{landNote}</Text> : null}
        </View>

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
            const player = game.players.find((entry) => entry.id === standing.playerId);
            const piece = playerToken(player?.token);
            const paying = standing.playerId === resolvedPayer;
            return (
              <Pressable
                key={standing.playerId}
                accessibilityRole="button"
                accessibilityLabel={paying ? `${standing.playerName}, paying` : `Select ${standing.playerName} as paying`}
                accessibilityState={{ selected: paying, disabled: !canBank }}
                disabled={!canBank}
                onPress={() => setPayerId(standing.playerId)}
                style={[
                  styles.cashCard,
                  paying ? styles.cashCardPaying : styles.cashCardOther,
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
                      const openNext = () =>
                        beginPlayerEdit(standing.playerId, standing.playerName, cash, player?.token);
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
                    {piece ? `${piece.emoji} ` : ''}
                    {standing.playerName}
                    {isYou ? ' · you' : ''}
                  </Text>
                )}
                {editing ? (
                  <TokenPicker
                    value={tokenDraft}
                    text={emojiDraft}
                    taken={takenTokens}
                    onChange={setTokenDraft}
                    onText={setEmojiDraft}
                  />
                ) : null}
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
                {standing.playerId === turnId && !complete ? (
                  <Badge label="Turn" tone="accent" style={styles.tileBadge} />
                ) : null}
                {broke ? <Badge label="Bankrupt" tone="danger" style={styles.tileBadge} /> : null}
                {standing.isLeader && !broke ? (
                  <Badge label="Richest" tone="accent" style={styles.tileBadge} />
                ) : null}
                {isPoorest ? <Badge label="Poorest" style={styles.tileBadge} /> : null}
                {standing.isWinner ? <Badge label="Winner" tone="success" style={styles.tileBadge} /> : null}
                {editing && game.players.length > 1 ? (
                  confirmingRemoveId === standing.playerId ? (
                    <View style={styles.removeConfirm}>
                      <Text style={styles.removePrompt}>Remove {standing.playerName}?</Text>
                      <Button
                        label="Cancel"
                        variant="ghost"
                        onPress={() => setConfirmingRemoveId(null)}
                        style={styles.removeBtn}
                      />
                      <Button
                        label="Remove"
                        variant="danger"
                        onPress={() => {
                          setEditingPlayerId((current) =>
                            current === standing.playerId ? null : current,
                          );
                          setConfirmingRemoveId(null);
                          void applyGame((g) => withoutPlayer(g, standing.playerId), {
                            suppressWin: true,
                          });
                        }}
                        style={styles.removeBtn}
                      />
                    </View>
                  ) : (
                    <Button
                      label="Remove"
                      variant="danger"
                      onPress={() => setConfirmingRemoveId(standing.playerId)}
                      style={styles.removeBtn}
                    />
                  )
                ) : null}
              </Pressable>
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
          <Text style={typography.body}>A trade, or any other payment the cards do not cover.</Text>
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

        {ownedDeeds.length > 0 ? (
          <Card>
            <Text style={typography.section}>Deeds</Text>
            {ownedDeeds.map((entry) => {
              const ownerId = play.owned[entry.id];
              const owner = game.players.find((player) => player.id === ownerId);
              const level = play.houses[entry.id] ?? 0;
              const mortgaged = play.mortgaged.includes(entry.id);
              const yours = ownerId === turnId;
              const status = mortgaged
                ? 'Mortgaged'
                : entry.kind !== 'street'
                  ? entry.group
                  : level >= 5
                    ? 'Hotel'
                    : level > 0
                      ? `${level} house${level === 1 ? '' : 's'}`
                      : 'Undeveloped';
              return (
                <View key={entry.id} style={styles.deed}>
                  <Text style={styles.cardTitle}>
                    {entry.name} · {owner?.name ?? 'Owner'} · {status}
                  </Text>
                  {yours && canDevelop ? (
                    <View style={styles.row}>
                      {canBuild(play, entry.id) ? (
                        <Button
                          label={level === 4 ? `Hotel ${formatMoney(buildingCost(entry.id))}` : `House ${formatMoney(buildingCost(entry.id))}`}
                          disabled={turnCash < buildingCost(entry.id)}
                          onPress={() =>
                            void commitPlay(buildHouse(play, game.tokenSpaces ?? {}, game.players, entry.id, turnCash))
                          }
                        />
                      ) : null}
                      {canSellBuilding(play, entry.id) ? (
                        <Button
                          label="Sell building"
                          onPress={() => void commitPlay(sellBuilding(play, game.tokenSpaces ?? {}, game.players, entry.id))}
                        />
                      ) : null}
                      {canMortgage(play, entry.id) ? (
                        <Button
                          label={`Mortgage ${formatMoney(mortgageValue(entry.id))}`}
                          onPress={() =>
                            void commitPlay(mortgageProperty(play, game.tokenSpaces ?? {}, game.players, entry.id))
                          }
                        />
                      ) : null}
                      {mortgaged ? (
                        <Button
                          label={`Unmortgage ${formatMoney(unmortgageCost(entry.id))}`}
                          disabled={turnCash < unmortgageCost(entry.id)}
                          onPress={() =>
                            void commitPlay(
                              unmortgageProperty(play, game.tokenSpaces ?? {}, game.players, entry.id, turnCash),
                            )
                          }
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : null}

        <Card>
          <Text style={typography.section}>Rent lookup</Text>
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
          <Text style={styles.rentPreview}>
            {quoteOwner
              ? `${partyName(quoteOwner)} owns it. Rent ${formatMoney(quoteRentAmount ?? 0)}${property.kind === 'utility' ? ` on a dice total of ${quoteDice}` : ''}.`
              : `Unowned. Price ${formatMoney(property.price)}.`}
          </Text>
        </Card>
        <PlaySpark sparks={sparks} />
      </View>

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
          const saved = await addPlayerToGame(game.shareCode, name, template.maxPlayers);
          setGame((current) => preferNewerGame(current, saved));
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
  cashCardPaying: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    borderWidth: 2,
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
  removeBtn: { alignSelf: 'stretch' },
  removeConfirm: { alignSelf: 'stretch', gap: 6 },
  removePrompt: {
    ...typography.label,
    fontSize: 13,
    textAlign: 'center',
    color: colors.danger,
  },
  deed: { gap: 8, paddingVertical: 4 },
  rentPreview: {
    ...typography.label,
    fontSize: 16,
    color: colors.accent,
  },
});

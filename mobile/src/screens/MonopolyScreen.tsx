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
  playerLabel,
  playerToken,
  properties,
  RAILROAD_COUNTS,
  RAILROAD_RENTS,
  singleEmoji,
  STREET_LEVELS,
  transferEvents,
  UTILITY_COUNTS,
  withoutLastCashAction,
  type BoardProperty,
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
  acceptCard,
  createMonopolyPlay,
  declineProperty,
  landedPropertyId,
  moneyFromSquare,
  mortgageProperty,
  mortgageValue,
  ownsMonopoly,
  payToLeaveJail,
  payDue,
  rentDue,
  resolveRoll,
  sellBuilding,
  turnPrompt,
  undoForCash,
  undoMonopoly,
  unmortgageCost,
  unmortgageProperty,
  useJailCard,
  type DrawnCard,
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
  const [drawnCards, setDrawnCards] = useState<DrawnCard[]>([]);
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

  const partyName = (id: string) => {
    if (id === BANK_PARTY_ID) return 'The Bank';
    const player = game.players.find((entry) => entry.id === id);
    return player ? playerLabel(player.name, player.token) : 'Player';
  };

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
    if (result.drawn?.length) setDrawnCards(result.drawn);
    else if (result.route) setDrawnCards([]);
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

  const winner = game.players.find((player) => player.name === snapshot.winnerName);
  const winnerLabel = winner ? playerLabel(winner.name, winner.token) : snapshot.winnerName;
  const banner = complete
    ? winnerLabel
      ? `${winnerLabel} wins with the most cash`
      : 'Game complete'
    : turnPrompt(play, game.players);

  const partyOptions = [
    { id: BANK_PARTY_ID, label: 'The Bank' },
    ...game.players.map((player) => ({
      id: player.id,
      label: player.id === localPlayerId ? `${playerLabel(player.name, player.token)} (you)` : playerLabel(player.name, player.token),
    })),
  ];

  const parsedAmount = parsePositiveAmount(amount);
  const paymentPreview = sameParty ? 'Choose a different payer and receiver.' : null;

  const takenTokens = game.players
    .filter((player) => player.id !== editingPlayerId)
    .map((player) => playerToken(player.token)?.emoji)
    .filter((emoji): emoji is string => Boolean(emoji));

  const ownedDeeds = properties.filter((entry) => play.owned[entry.id]);
  const landedProperty = getProperty(landedPropertyId(play, game.tokenSpaces ?? {}) ?? '');
  const pendingProperty = play.pending?.kind === 'buy' ? getProperty(play.pending.propertyId) : undefined;
  const pendingCard = play.pending?.kind === 'card' ? play.pending : null;
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
          <View style={styles.titleBlock}>
            <Text style={[typography.title, styles.centerText]}>{game.name}</Text>
            <Badge label="Monopoly" tone="accent" style={styles.centerBadge} />
          </View>
          <View style={styles.headerTools}>
            <GameHelp templateId="monopoly" />
            <ShareCodePanel shareCode={game.shareCode} />
            <HomeButton onPress={() => navigation.navigate('Home')} />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
          {landNote ? <Text style={styles.bannerNote}>{landNote}</Text> : null}
        </View>
        <View style={styles.actions}>
                  <Button
                    label="Undo"
                    onPress={() => {
                      setMoneyFlight(null);
                      setDrawnCards([]);
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
        <MonopolyBoard
          players={game.players}
          owned={play.owned}
          tokenSpaces={game.tokenSpaces}
          inJail={play.jail}
          tokenRoute={tokenRoute}
          drawnCards={drawnCards}
          cardOffer={pendingCard}
          onAcceptCard={
            pendingCard && canBank
              ? () => void commitPlay(acceptCard(play, game.tokenSpaces ?? {}, game.players))
              : undefined
          }
          chanceCount={play.chance.length}
          chestCount={play.chest.length}
          moneyFlight={moneyFlight}
          onDragging={setBoardDragging}
          roll={
            <View pointerEvents="box-none" style={styles.rollStack}>
              <Button
                label={rollingDice ? 'Rolling…' : inJail ? 'Roll for doubles' : `Roll for ${turnPlayer ? playerLabel(turnPlayer.name, turnPlayer.token) : 'player'}`}
                variant="primary"
                disabled={!canBank || rollingDice || play.pending != null || !turnPlayer}
                onPress={rollForPlayer}
              />
              {play.pending?.kind === 'pay' ? (
                <Button
                  label={`Pay ${formatMoney(play.pending.amount)}`}
                  variant="primary"
                  disabled={!canBank}
                  onPress={() => void commitPlay(payDue(play, game.tokenSpaces ?? {}, game.players))}
                />
              ) : null}
            </View>
          }
          diceRoll={diceRoll}
        />

        {landedProperty ? (
          <RentLookup
            property={landedProperty}
            play={play}
            dice={quoteDice}
            ownerName={
              play.owned[landedProperty.id] ? partyName(play.owned[landedProperty.id]) : null
            }
          />
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
            const player = game.players.find((entry) => entry.id === standing.playerId);
            const piece = playerToken(player?.token);
            const paying = standing.playerId === resolvedPayer;
            const holdings = properties.filter((entry) => play.owned[entry.id] === standing.playerId);
            return (
              <Pressable
                key={standing.playerId}
                accessibilityRole="button"
                accessibilityLabel={paying ? `${playerLabel(standing.playerName, player?.token)}, paying` : `Select ${playerLabel(standing.playerName, player?.token)} as paying`}
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
                    accessibilityLabel={editing ? `Save ${playerLabel(standing.playerName, player?.token)}` : `Edit ${playerLabel(standing.playerName, player?.token)}`}
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
                <View
                  style={styles.holdings}
                  accessibilityLabel={
                    holdings.length === 0
                      ? `${standing.playerName} owns no properties`
                      : `${standing.playerName} owns ${holdings.map((entry) => entry.name).join(', ')}`
                  }
                >
                  {holdings.length === 0 ? (
                    <Text style={styles.holdingEmpty}>No properties</Text>
                  ) : (
                    holdings.map((entry) => {
                      const level = play.houses[entry.id] ?? 0;
                      const mortgaged = play.mortgaged.includes(entry.id);
                      const detail = mortgaged
                        ? 'Mortgaged'
                        : entry.kind !== 'street'
                          ? null
                          : level >= 5
                            ? 'Hotel'
                            : level > 0
                              ? `${level} house${level === 1 ? '' : 's'}`
                              : null;
                      return (
                        <View key={entry.id} style={styles.holding}>
                          <View style={[styles.holdingSwatch, { backgroundColor: entry.swatch }]} />
                          <Text style={[styles.holdingName, mortgaged && styles.holdingMortgaged]}>
                            {entry.name}
                            {detail ? <Text style={styles.holdingDetail}>{` · ${detail}`}</Text> : null}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
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
                      <Text style={styles.removePrompt}>Remove {playerLabel(standing.playerName, player?.token)}?</Text>
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

        <Card style={styles.panel}>
          <Text style={[typography.section, styles.centerText]}>Payment</Text>
          <Text style={[typography.body, styles.centerText]}>
            Choose who pays and who receives. The bank is where money comes from for passing Go, and where it goes for taxes or buying property.
          </Text>
          <OptionSelect
            label="Paying"
            value={resolvedPayer}
            disabled={!canBank}
            options={partyOptions}
            onChange={setPayerId}
            centered
          />
          <OptionSelect
            label="Receiving"
            value={resolvedReceiver}
            disabled={!canBank}
            options={partyOptions}
            onChange={setReceiverId}
            centered
          />
          {paymentPreview ? <Text style={styles.error}>{paymentPreview}</Text> : null}
        </Card>

        <Card style={styles.panel}>
          <Text style={[typography.section, styles.centerText]}>Adjust cash</Text>
          <Text style={[typography.body, styles.centerText]}>A trade, or any other payment the cards do not cover.</Text>
          <Field
            value={amount}
            onChangeText={(text) => {
              setAmount(text.replace(/[^\d]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="Amount"
            editable={canBank}
            style={styles.amountField}
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
          />
        </Card>

        {ownedDeeds.length > 0 ? (
          <Card style={styles.panel}>
            <Text style={[typography.section, styles.centerText]}>Deeds</Text>
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
                    {entry.name} · {owner ? playerLabel(owner.name, owner.token) : 'Owner'} · {status}
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

        <Card style={styles.panel}>
          <Text style={[typography.section, styles.centerText]}>Rent lookup</Text>
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
            centered
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
          winnerName={winnerLabel}
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

function RentLookup({
  property,
  play,
  dice,
  ownerName,
}: {
  property: BoardProperty;
  play: NonNullable<Game['monopoly']>;
  dice: number;
  ownerName: string | null;
}) {
  const mortgaged = play.mortgaged.includes(property.id);
  const owned = Boolean(ownerName) && !mortgaged;
  const level = play.houses[property.id] ?? 0;
  const doubled =
    owned && property.kind === 'street' && level === 0 && ownsMonopoly(play, play.owned[property.id] ?? '', property.group);
  const summary = !ownerName
    ? `Unowned. Price ${formatMoney(property.price)}.`
    : mortgaged
      ? `${ownerName} owns it. Mortgaged, so no rent is due.`
      : doubled
        ? `${ownerName} owns the color set. Rent ${formatMoney(rentDue(play, property.id, dice))}.`
        : property.kind === 'utility'
          ? `${ownerName} owns it. Rent ${formatMoney(rentDue(play, property.id, dice))} on a dice total of ${dice}.`
          : `${ownerName} owns it. Rent ${formatMoney(rentDue(play, property.id, dice))}.`;
  const lines = rentLines(property, play, dice, owned);

  return (
    <Card style={styles.panel}>
      <Text style={[typography.section, styles.centerText]}>Rent lookup</Text>
      <View style={styles.rentTitle}>
        <View style={[styles.rentSwatch, { backgroundColor: property.swatch }]} />
        <Text style={styles.rentName}>{property.name}</Text>
      </View>
      <Text style={styles.rentPreview}>{summary}</Text>
      {lines.map((line) => (
        <View key={line.label} style={[styles.rentRow, line.active && styles.rentRowActive]}>
          <Text style={[styles.rentLabel, line.active && styles.rentActiveText]}>{line.label}</Text>
          <Text style={[styles.rentAmount, line.active && styles.rentActiveText]}>{line.amount}</Text>
        </View>
      ))}
    </Card>
  );
}

function rentLines(property: BoardProperty, play: NonNullable<Game['monopoly']>, dice: number, owned: boolean) {
  if (property.kind === 'street' && property.rents) {
    const level = owned ? (play.houses[property.id] ?? 0) : -1;
    return STREET_LEVELS.map((entry) => ({
      label: entry.label,
      amount: formatMoney(property.rents?.[entry.id] ?? 0),
      active: entry.id === level,
    }));
  }
  if (property.kind === 'railroad') {
    const owner = play.owned[property.id];
    const count = owned
      ? properties.filter(
          (entry) => entry.kind === 'railroad' && play.owned[entry.id] === owner && !play.mortgaged.includes(entry.id),
        ).length
      : 0;
    return RAILROAD_COUNTS.map((entry) => ({
      label: entry.label,
      amount: formatMoney(RAILROAD_RENTS[entry.id]),
      active: entry.id === count,
    }));
  }
  const owner = play.owned[property.id];
  const count = owned
    ? properties.filter(
        (entry) => entry.kind === 'utility' && play.owned[entry.id] === owner && !play.mortgaged.includes(entry.id),
      ).length
    : 0;
  return UTILITY_COUNTS.map((entry) => ({
    label: entry.label,
    amount: formatMoney((entry.id === 2 ? 10 : 4) * dice),
    active: entry.id === count,
  }));
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
  content: {
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    gap: 12,
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  titleBlock: { alignItems: 'center', gap: 4 },
  headerTools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  centerText: { textAlign: 'center', alignSelf: 'stretch' },
  centerBadge: { alignSelf: 'center' },
  panel: { alignSelf: 'stretch', alignItems: 'center' },
  amountField: { alignSelf: 'stretch', textAlign: 'center' },
  banner: {
    alignSelf: 'stretch',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    padding: 12,
    borderRadius: radii.md,
    gap: 4,
    alignItems: 'center',
  },
  bannerNote: {
    ...typography.label,
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  rollStack: { alignItems: 'center', gap: 8 },
  bannerText: { ...typography.label, fontSize: 15, textAlign: 'center', alignSelf: 'stretch' },
  row: { alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  error: { color: colors.danger, textAlign: 'center', alignSelf: 'stretch' },
  wrap: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  cashCard: {
    width: 240,
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
  holdings: {
    alignSelf: 'stretch',
    gap: 4,
  },
  holding: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  holdingSwatch: {
    width: 8,
    height: 14,
    borderRadius: 2,
    marginTop: 2,
  },
  holdingName: {
    ...typography.label,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'left',
  },
  holdingDetail: {
    color: colors.textDim,
    fontWeight: '600',
  },
  holdingMortgaged: {
    color: colors.muted,
  },
  holdingEmpty: {
    ...typography.label,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
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
  deed: { alignSelf: 'stretch', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rentPreview: {
    ...typography.label,
    fontSize: 16,
    color: colors.accent,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  rentTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rentSwatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: colors.border },
  rentName: { ...typography.label, fontSize: 16 },
  rentRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
  },
  rentRowActive: { backgroundColor: colors.accentSoft },
  rentLabel: { ...typography.label, color: colors.textDim, fontWeight: '500' },
  rentAmount: { ...typography.label, fontSize: 15 },
  rentActiveText: { color: colors.accent, fontWeight: '700' },
});

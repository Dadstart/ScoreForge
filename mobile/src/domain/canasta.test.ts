import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addToMeld,
  arrangeHand,
  sortPlayerHand,
  canTakeDiscard,
  cardPoints,
  createCanastaState,
  dealCount,
  discard,
  drawStock,
  ensureCanastaState,
  freshDeck,
  isRedThree,
  meldLabel,
  meldNew,
  openingRequirement,
  scoreForPlayer,
  takeDiscard,
  undoMove,
  winnerIds,
  type CanastaResult,
  type CanastaState,
  type CanastaTeam,
  type Meld,
} from './canasta';
import { createGame, createPlayer } from './models';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';

const named = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
  { id: 'cy', name: 'Cy' },
  { id: 'dee', name: 'Dee' },
];

function kings(count: number, copy = 1): string[] {
  return ['S', 'H', 'D', 'C', 'S', 'H', 'D', 'C'].slice(0, count).map((suit, index) => {
    const which = index < 4 ? copy : copy + 1;
    return `K${suit}#${which}`;
  });
}

function team(id: string, extra?: Partial<CanastaTeam>): CanastaTeam {
  return { playerIds: [id], melds: [], total: 0, opened: false, ...extra };
}

function playState(hands: Record<string, string[]>, extra?: Partial<CanastaState>): CanastaState {
  const order = extra?.order ?? Object.keys(hands);
  const teams = extra?.teams ?? order.map((id) => team(id));
  const melded = extra?.melded ?? Object.fromEntries(order.map((id) => [id, false]));
  const redThrees = extra?.redThrees ?? Object.fromEntries(order.map((id) => [id, [] as string[]]));
  const state: CanastaState = {
    order,
    teams,
    hands,
    redThrees,
    stock: extra?.stock ?? ['QS#1'],
    discard: extra?.discard ?? ['7H#1'],
    dealer: order.length - 1,
    turn: extra?.turn ?? order[0],
    phase: extra?.phase ?? 'play',
    handNumber: 1,
    needCard: extra?.needCard ?? null,
    tookPack: extra?.tookPack ?? false,
    openingPoints: extra?.openingPoints ?? 0,
    melded,
    blackThreesLaid: extra?.blackThreesLaid ?? false,
    checkpoint: null,
    lastScores: null,
    lastAction: null,
    wentOut: null,
    drawn: extra?.drawn ?? [],
  };
    state.checkpoint = extra?.checkpoint === undefined
      ? {
        hands: structuredClone(hands),
        redThrees: structuredClone(redThrees),
        teams: teams.map((entry) => ({ melds: structuredClone(entry.melds), opened: entry.opened })),
        melded: { ...melded },
      }
      : extra.checkpoint;
  return state;
}

function ok(result: CanastaResult): CanastaState {
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

function err(result: CanastaResult): string {
  if (!('error' in result)) assert.fail('expected an error');
  return result.error;
}

describe('canasta', () => {
  it('deals two decks and four jokers', () => {
    const deck = freshDeck();
    assert.equal(deck.length, 108);
    assert.equal(new Set(deck).size, 108);
    assert.equal(deck.filter((card) => card.startsWith('JR') || card.startsWith('JB')).length, 4);
    assert.equal(cardPoints('JR#1'), 50);
    assert.equal(cardPoints('AS#1'), 20);
    assert.equal(cardPoints('2H#2'), 20);
    assert.equal(cardPoints('KH#1'), 10);
    assert.equal(cardPoints('7C#1'), 5);
    assert.equal(openingRequirement(-10), 15);
    assert.equal(openingRequirement(0), 50);
    assert.equal(openingRequirement(1499), 50);
    assert.equal(openingRequirement(1500), 90);
    assert.equal(openingRequirement(3000), 120);
    assert.deepEqual([2, 3, 4].map(dealCount), [15, 13, 11]);
  });

  it('deals 15 cards and lays red threes aside', () => {
    const dealt = createCanastaState([{ id: 'ada' }, { id: 'bea' }], { deck: freshDeck() });
    assert.equal(dealt.hands.ada?.length, 15);
    assert.equal(dealt.hands.bea?.length, 15);
    assert.equal(dealt.hands.ada?.some(isRedThree), false);
    assert.equal(dealt.hands.bea?.some(isRedThree), false);
    assert.deepEqual(dealt.redThrees.ada, ['3D#1']);
    assert.deepEqual(dealt.redThrees.bea, ['3H#1']);
    assert.equal(dealt.discard.at(-1), '7D#1');
    assert.equal(dealt.turn, 'ada');
    assert.equal(dealt.phase, 'draw');
    assert.match(dealt.lastAction ?? '', /Draw two cards/);
  });

  it('draws two cards for two players and one card for a larger table', () => {
    const pair = playState({ ada: ['4S#1'], bea: ['QS#1'] }, { phase: 'draw', stock: ['KS#1', '3H#2', 'QH#1', '8C#1'] });
    const both = ok(drawStock(pair, 'ada', named));
    assert.deepEqual(both.hands.ada, ['4S#1', 'KS#1', 'QH#1']);
    assert.deepEqual(both.redThrees.ada, ['3H#2']);
    assert.deepEqual(both.stock, ['8C#1']);
    assert.deepEqual(both.drawn, ['KS#1', '3H#2', 'QH#1']);
    assert.match(both.lastAction ?? '', /K of spades and the Q of hearts/);
    const three = playState(
      { ada: ['4S#1'], bea: ['QS#1'], cy: ['5S#1'] },
      { phase: 'draw', order: ['ada', 'bea', 'cy'], turn: 'ada', stock: ['KS#1', 'QH#1'] },
    );
    const one = ok(drawStock(three, 'ada', named));
    assert.equal(one.hands.ada?.includes('KS#1'), true);
    assert.equal(one.hands.ada?.includes('QH#1'), false);
    assert.deepEqual(one.drawn, ['KS#1']);
    const passed = ok(discard(both, 'ada', '4S#1', named));
    assert.deepEqual(passed.drawn, []);
  });

  it('deals 13 and 11 cards and seats partners opposite', () => {
    const three = createCanastaState([{ id: 'ada' }, { id: 'bea' }, { id: 'cy' }], { deck: freshDeck() });
    assert.equal(three.hands.ada?.length, 13);
    assert.equal(three.teams.length, 3);
    const four = createCanastaState(named, { deck: freshDeck() });
    assert.equal(four.hands.ada?.length, 11);
    assert.deepEqual(four.teams.map((entry) => entry.playerIds), [['ada', 'cy'], ['bea', 'dee']]);
    assert.equal(createCanastaState([{ id: 'ada' }]).phase, 'waiting');
  });

  it('opens on 50 and refuses to discard short', () => {
    const state = playState({
      ada: ['AS#1', 'AH#1', 'AD#1', 'KH#1', 'KD#1', 'KC#1', '4S#1'],
      bea: ['QS#1'],
    });
    const partial = ok(meldNew(state, 'ada', ['KH#1', 'KD#1', 'KC#1'], named));
    assert.equal(partial.teams[0]?.opened, false);
    assert.equal(partial.openingPoints, 30);
    assert.match(err(discard(partial, 'ada', '4S#1', named)), /50/);
    const opened = ok(meldNew(partial, 'ada', ['AS#1', 'AH#1', 'AD#1'], named));
    assert.equal(opened.teams[0]?.opened, true);
    assert.equal(opened.openingPoints, 90);
  });

  it('refuses too many wilds and a meld of twos', () => {
    const state = playState({
      ada: ['8S#1', '8H#1', '2S#1', '2H#1', 'JR#1', '2D#1', '2C#1'],
      bea: ['QS#1'],
    }, { teams: [team('ada', { opened: true }), team('bea')] });
    assert.match(err(meldNew(state, 'ada', ['8S#1', '8H#1', '2S#1', '2H#1', 'JR#1'], named)), /natural/);
    assert.match(err(meldNew(state, 'ada', ['2S#1', '2H#1', '2D#1'], named)), /natural/);
    const mixed = ok(meldNew(state, 'ada', ['8S#1', '8H#1', '2S#1'], named));
    assert.equal(mixed.teams[0]?.melds[0]?.rank, 8);
  });

  it('takes a frozen pack only with a natural pair and enough to open', () => {
    const frozen = playState({
      ada: ['7S#1', '7D#1', 'KS#1', 'KH#1', 'KD#1', 'KC#1', 'AH#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['2S#1', '7H#1'] });
    assert.equal(canTakeDiscard(frozen, 'ada'), true);
    const thin = playState({
      ada: ['7S#1', '4S#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['2S#1', '7H#1'] });
    assert.equal(canTakeDiscard(thin, 'ada'), false);
    assert.match(err(takeDiscard(thin, 'ada', named)), /pair|50/);
    const taken = ok(takeDiscard(frozen, 'ada', named));
    assert.equal(taken.phase, 'play');
    assert.equal(taken.needCard, '7H#1');
    assert.equal(taken.discard.length, 0);
    assert.equal(taken.tookPack, true);
    const blocked = playState({
      ada: ['7S#1', '7D#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['3S#1'] });
    assert.equal(canTakeDiscard(blocked, 'ada'), false);
    const wildTop = playState({
      ada: ['7S#1', '7D#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['7H#1', 'JR#1'] });
    assert.equal(canTakeDiscard(wildTop, 'ada'), false);
  });

  it('lets an open side take an unfrozen pack with one natural and a wild', () => {
    const state = playState({
      ada: ['7S#1', '2H#1', '4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      discard: ['9S#1', '7H#1'],
      teams: [team('ada', { opened: true }), team('bea')],
    });
    assert.equal(canTakeDiscard(state, 'ada'), true);
    const bare = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      discard: ['7H#1'],
      teams: [team('ada', { opened: true }), team('bea')],
    });
    assert.equal(canTakeDiscard(bare, 'ada'), false);
    assert.match(err(takeDiscard(bare, 'ada', named)), /meld the top card/);
    const onMeld = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      discard: ['7H#1'],
      teams: [team('ada', { opened: true, melds: [{ rank: 7, cards: ['7S#1', '7D#1', '7C#1'] }] }), team('bea')],
    });
    assert.equal(canTakeDiscard(onMeld, 'ada'), true);
  });

  it('refuses the pack when the top card cannot make a legal opening meld', () => {
    const pairs = playState({
      ada: ['7S#1', '7D#1', 'KS#1', 'KH#1', 'QS#1', 'QH#1', '4S#1'],
      bea: ['5S#1'],
    }, { phase: 'draw', discard: ['7H#1'] });
    assert.equal(canTakeDiscard(pairs, 'ada'), false);
    assert.match(err(takeDiscard(pairs, 'ada', named)), /50/);
    const buried = playState({
      ada: ['7S#1', '7D#1', '4S#1', '5H#1', '6D#1', '8C#1', '9S#1'],
      bea: ['5S#1'],
    }, { phase: 'draw', discard: ['AS#1', 'AH#1', 'AD#1', '7H#1'] });
    assert.equal(canTakeDiscard(buried, 'ada'), false);
    const wildHelp = playState({
      ada: ['7S#1', '2H#1', '4S#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['7H#1'] });
    assert.equal(canTakeDiscard(wildHelp, 'ada'), false);
    assert.match(err(takeDiscard(wildHelp, 'ada', named)), /meld the top card/);
    const enough = playState({
      ada: ['7S#1', '7D#1', 'AS#1', 'AH#1', 'AD#1', '4S#1'],
      bea: ['QS#1'],
    }, { phase: 'draw', discard: ['9S#1', '7H#1'] });
    assert.equal(canTakeDiscard(enough, 'ada'), true);
  });

  it('requires the top card of a taken pack in a meld', () => {
    const state = playState({
      ada: ['7S#1', '7D#1', '7H#1', 'KS#1', 'KH#1', 'KD#1', '4S#1'],
      bea: ['QS#1'],
    }, { needCard: '7H#1', tookPack: true });
    assert.match(err(discard(state, 'ada', '4S#1', named)), /7 of hearts/);
    const melded = ok(meldNew(state, 'ada', ['7S#1', '7D#1', '7H#1'], named));
    assert.equal(melded.needCard, '7H#1');
    assert.equal(melded.hands.ada?.includes('7H#1'), false);
    assert.match(err(discard(melded, 'ada', '4S#1', named)), /50/);
  });

  it('scores a natural canasta and a concealed go-out', () => {
    const hand = kings(7);
    const state = playState({ ada: hand, bea: ['QS#1'] });
    const out = ok(meldNew(state, 'ada', hand, named));
    assert.equal(out.phase, 'handOver');
    assert.equal(out.wentOut, 0);
    const lines = out.lastScores?.[0]?.lines ?? [];
    assert.equal(lines.find((line) => line.label === 'Natural canasta')?.points, 500);
    assert.equal(lines.find((line) => line.label === 'Going out')?.points, 100);
    assert.equal(lines.find((line) => line.label === 'Concealed hand')?.points, 100);
    assert.equal(out.lastScores?.[0]?.points, 70 + 500 + 100 + 100);
    assert.equal(scoreForPlayer(out, 'ada'), 770);
  });

  it('turns a natural canasta mixed when a wild is added', () => {
    const meld: Meld = { rank: 13, cards: kings(7) };
    const state = playState({
      ada: ['JR#1', '4S#1'],
      bea: ['QS#1'],
    }, { teams: [team('ada', { opened: true, melds: [meld] }), team('bea')] });
    const added = ok(addToMeld(state, 'ada', 0, ['JR#1'], named));
    assert.match(meldLabel(added.teams[0]!.melds[0]!), /mixed canasta/);
    const gone = ok(discard(added, 'ada', '4S#1', named));
    assert.equal(gone.lastScores?.[0]?.lines.find((line) => line.label === 'Mixed canasta')?.points, 300);
  });

  it('will not go out without a canasta', () => {
    const state = playState({
      ada: ['AS#1', 'AH#1', 'AD#1'],
      bea: ['QS#1'],
    });
    assert.match(err(meldNew(state, 'ada', ['AS#1', 'AH#1', 'AD#1'], named)), /canasta/);
    assert.equal(state.hands.ada?.length, 3);
    const open = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, { teams: [team('ada', { opened: true, melds: [{ rank: 8, cards: ['8S#1', '8H#1', '8D#1'] }] }), team('bea')] });
    assert.match(err(discard(open, 'ada', '4S#1', named)), /canasta/);
  });

  it('melds black threes only while going out', () => {
    const canasta: Meld = { rank: 13, cards: kings(7) };
    const early = playState({
      ada: ['3S#1', '3C#1', '3S#2', '4S#1'],
      bea: ['QS#1'],
    }, { teams: [team('ada', { opened: true, melds: [canasta] }), team('bea')] });
    assert.match(err(meldNew(early, 'ada', ['3S#1', '3C#1', '3S#2'], named)), /go out/);
    const out = playState({
      ada: ['3S#1', '3C#1', '3S#2'],
      bea: ['QS#1'],
    }, { teams: [team('ada', { opened: true, melds: [canasta] }), team('bea')] });
    const done = ok(meldNew(out, 'ada', ['3S#1', '3C#1', '3S#2'], named));
    assert.equal(done.phase, 'handOver');
    assert.equal(done.teams[0]?.melds.some((meld) => meld.rank === 3), true);
  });

  it('scores red threes down when a side never opens, and 800 for all four', () => {
    const stuck = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      stock: [],
      discard: ['3S#1'],
      redThrees: { ada: ['3H#1'], bea: [] },
    });
    const closed = ok(drawStock(stuck, 'ada', named));
    assert.equal(closed.phase, 'handOver');
    assert.equal(closed.lastScores?.[0]?.lines.find((line) => line.label.includes('Red'))?.points, -100);
    const fours = playState({
      ada: [],
      bea: ['4S#1'],
      cy: [],
      dee: [],
    }, {
      order: ['ada', 'bea', 'cy', 'dee'],
      phase: 'draw',
      turn: 'ada',
      stock: [],
      discard: ['3S#1'],
      teams: [
        team('ada', { playerIds: ['ada', 'cy'], total: 0 }),
        team('bea', { playerIds: ['bea', 'dee'] }),
      ],
      redThrees: { ada: ['3H#1', '3D#1'], cy: ['3H#2', '3D#2'], bea: [], dee: [] },
    });
    const bonus = ok(drawStock(fours, 'ada', named));
    assert.equal(bonus.lastScores?.[0]?.points, -800);
  });

  it('ends the game at 5000 and deals again on a tie', () => {
    const canasta: Meld = { rank: 13, cards: kings(7) };
    const winning = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, {
      teams: [
        team('ada', { opened: true, total: 4400, melds: [canasta] }),
        team('bea', { total: 100 }),
      ],
      melded: { ada: true, bea: false },
    });
    const over = ok(discard(winning, 'ada', '4S#1', named));
    assert.equal(over.phase, 'gameOver');
    assert.deepEqual(winnerIds(over), ['ada']);
    assert.match(over.lastAction ?? '', /Ada wins/);

    const tied = playState({
      ada: ['4S#1'],
      bea: [],
    }, {
      teams: [
        team('ada', { opened: true, total: 4500, melds: [canasta] }),
        team('bea', { total: 5170 }),
      ],
      melded: { ada: true, bea: false },
    });
    const again = ok(discard(tied, 'ada', '4S#1', named));
    assert.equal(again.phase, 'handOver');
    assert.equal(again.teams[0]?.total, again.teams[1]?.total);
    assert.equal(winnerIds(again).length, 0);
  });

  it('takes back the last meld and keeps the card that came from the pack', () => {
    const state = playState({
      ada: ['AS#1', 'AH#1', 'AD#1', '4S#1'],
      bea: ['QS#1'],
    }, { needCard: 'AS#1', tookPack: true });
    const melded = ok(meldNew(state, 'ada', ['AS#1', 'AH#1', 'AD#1'], named));
    const back = ok(undoMove(melded));
    assert.deepEqual(back.hands.ada, state.hands.ada);
    assert.equal(back.teams[0]?.melds.length, 0);
    assert.equal(back.teams[0]?.opened, false);
    assert.equal(back.needCard, 'AS#1');
    assert.equal(back.tookPack, true);
    assert.equal(back.history?.length, 0);
  });

  it('undoes a draw, a discard, and one meld at a time', () => {
    const state = playState({
      ada: ['AS#1', 'AH#1', 'AD#1', 'KS#1', 'KH#1', 'KD#1', '4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      stock: ['JS#1', 'JH#1', 'JD#1'],
      discard: ['7H#1'],
      teams: [team('ada', { opened: true }), team('bea')],
    });
    const drawn = ok(drawStock(state, 'ada', named));
    assert.equal(drawn.phase, 'play');
    assert.equal(drawn.hands.ada?.includes('JS#1'), true);
    const aces = ok(meldNew(drawn, 'ada', ['AS#1', 'AH#1', 'AD#1'], named));
    const kings = ok(meldNew(aces, 'ada', ['KS#1', 'KH#1', 'KD#1'], named));
    assert.equal(kings.teams[0]?.melds.length, 2);
    const oneMeld = ok(undoMove(kings));
    assert.equal(oneMeld.teams[0]?.melds.length, 1);
    assert.equal(oneMeld.teams[0]?.melds[0]?.rank, 1);
    assert.equal(oneMeld.hands.ada?.includes('KS#1'), true);
    const discarded = ok(discard(oneMeld, 'ada', '4S#1', named));
    assert.equal(discarded.turn, 'bea');
    assert.equal(discarded.phase, 'draw');
    const undiscarded = ok(undoMove(discarded));
    assert.equal(undiscarded.turn, 'ada');
    assert.equal(undiscarded.phase, 'play');
    assert.equal(undiscarded.hands.ada?.includes('4S#1'), true);
    assert.equal(undiscarded.discard.at(-1), '7H#1');
    const undrawn = ok(undoMove(ok(undoMove(undiscarded))));
    assert.equal(undrawn.phase, 'draw');
    assert.deepEqual(undrawn.stock, state.stock);
    assert.deepEqual(undrawn.hands.ada, state.hands.ada);
    assert.match(err(undoMove(undrawn)), /nothing/);
  });

  it('puts a taken pack and a finished hand back', () => {
    const open = playState({
      ada: ['7S#1', '7D#1', '4S#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      discard: ['9S#1', '7H#1'],
      teams: [team('ada', { opened: true }), team('bea')],
    });
    const taken = ok(takeDiscard(open, 'ada', named));
    assert.equal(taken.discard.length, 0);
    const returned = ok(undoMove(taken));
    assert.deepEqual(returned.discard, ['9S#1', '7H#1']);
    assert.equal(returned.phase, 'draw');
    assert.equal(returned.tookPack, false);

    const canasta: Meld = { rank: 13, cards: kings(7) };
    const winning = playState({
      ada: ['4S#1'],
      bea: ['QS#1'],
    }, {
      teams: [
        team('ada', { opened: true, total: 4400, melds: [canasta] }),
        team('bea', { total: 100 }),
      ],
      melded: { ada: true, bea: false },
    });
    const over = ok(discard(winning, 'ada', '4S#1', named));
    assert.equal(over.phase, 'gameOver');
    const playing = ok(undoMove(over));
    assert.equal(playing.phase, 'play');
    assert.equal(playing.turn, 'ada');
    assert.equal(playing.teams[0]?.total, 4400);
    assert.equal(playing.lastScores, null);
  });

  it('keeps a dragged hand order through a draw and a meld', () => {
    const state = playState({
      ada: ['4S#1', '4H#1', '4D#1', 'AS#1', 'KH#1'],
      bea: ['QS#1'],
    }, {
      phase: 'draw',
      stock: ['JS#1', 'QH#1'],
      teams: [team('ada', { opened: true }), team('bea')],
    });
    const arranged = ok(arrangeHand(state, 'ada', ['KH#1', 'AS#1', '4S#1', '4H#1', '4D#1']));
    assert.deepEqual(arranged.hands.ada, ['KH#1', 'AS#1', '4S#1', '4H#1', '4D#1']);
    assert.equal(arranged.history, undefined);
    const same = arrangeHand(arranged, 'ada', arranged.hands.ada ?? []);
    assert.ok('state' in same && same.state === arranged);
    assert.match(err(arrangeHand(arranged, 'ada', ['KH#1', 'AS#1'])), /hand/);
    const drawn = ok(drawStock(arranged, 'ada', named));
    assert.deepEqual(drawn.hands.ada, ['KH#1', 'AS#1', '4S#1', '4H#1', '4D#1', 'JS#1', 'QH#1']);
    const melded = ok(meldNew(drawn, 'ada', ['4S#1', '4H#1', '4D#1'], named));
    assert.deepEqual(melded.hands.ada, ['KH#1', 'AS#1', 'JS#1', 'QH#1']);
    const sorted = ok(sortPlayerHand(melded, 'ada'));
    assert.deepEqual(sorted.hands.ada, ['AS#1', 'KH#1', 'QH#1', 'JS#1']);
    assert.equal(sorted.history, melded.history);
    const again = sortPlayerHand(sorted, 'ada');
    assert.ok('state' in again && again.state === sorted);
  });

  it('repairs a broken deal and leaves a healthy game alone', () => {
    const players = [createPlayer('Ada'), createPlayer('Bea')];
    const game = { ...createGame({ name: 'Canasta', templateId: 'canasta', players }), canasta: null };
    const repaired = ensureCanastaState(game);
    assert.equal(repaired.canasta?.phase, 'draw');
    assert.equal(repaired.canasta?.hands[players[0].id]?.length, 15);
    assert.equal(ensureCanastaState(repaired), repaired);
    const dealt = repaired.canasta;
    assert.ok(dealt);
    const drew = ok(drawStock(dealt, players[0].id, players));
    const withHistory = { ...repaired, canasta: drew };
    assert.equal(ensureCanastaState(withHistory), withHistory);
    const waiting = ensureCanastaState({
      ...createGame({ name: 'Canasta', templateId: 'canasta', players: [createPlayer('Ada')] }),
      canasta: null,
    });
    assert.equal(waiting.canasta?.phase, 'waiting');
    const other = createGame({ name: 'Chess', templateId: 'chess', players });
    assert.equal(ensureCanastaState(other), other);
  });

  it('scores partners together and ends when the hand says the game is over', () => {
    const template = getTemplate('canasta');
    assert.ok(template);
    const players = [createPlayer('Ada'), createPlayer('Bea'), createPlayer('Cy'), createPlayer('Dee')];
    const ids = players.map((player) => player.id);
    const dealt = createCanastaState(players, { deck: freshDeck() });
    const finished: CanastaState = {
      ...dealt,
      phase: 'gameOver',
      turn: null,
      teams: dealt.teams.map((entry, index) => ({ ...entry, total: index === 0 ? 5200 : 800 })),
    };
    const game = { ...createGame({ name: 'Canasta', templateId: 'canasta', players }), canasta: finished };
    const snapshot = calculate(game, template);
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.standings.filter((row) => row.isWinner).length, 2);
    assert.equal(snapshot.standings.find((row) => row.playerId === ids[0])?.total, 5200);
    assert.equal(snapshot.standings.find((row) => row.playerId === ids[2])?.total, 5200);
    assert.equal(snapshot.winnerName, 'Ada');
  });
});

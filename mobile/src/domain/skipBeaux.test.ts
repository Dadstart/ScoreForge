import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, createPlayer } from './models';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import {
  canBuild,
  createSkipBeauxState,
  dealGame,
  dealNext,
  discardCard,
  endTurn,
  ensureSkipBeauxState,
  freshDeck,
  isCard,
  neededRank,
  playBuilding,
  stockSize,
  winnerIds,
  type Pile,
  type SkipBeauxResult,
  type SkipBeauxState,
} from './skipBeaux';

const named = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
];

function slots(): Pile[] {
  return [{ cards: [] }, { cards: [] }, { cards: [] }, { cards: [] }];
}

function table(extra?: Partial<SkipBeauxState>): SkipBeauxState {
  return {
    order: extra?.order ?? ['ada', 'bea'],
    hands: extra?.hands ?? { ada: [], bea: [] },
    stocks: extra?.stocks ?? { ada: ['9#1'], bea: ['8#1'] },
    discards: extra?.discards ?? { ada: slots(), bea: slots() },
    buildings: extra?.buildings ?? slots(),
    draw: extra?.draw ?? [],
    completed: extra?.completed ?? [],
    dealer: extra?.dealer ?? 1,
    turn: extra?.turn === undefined ? 'ada' : extra.turn,
    phase: extra?.phase ?? 'play',
    handNumber: extra?.handNumber ?? 1,
    totals: extra?.totals ?? { ada: 0, bea: 0 },
    lastAction: extra?.lastAction ?? null,
    lastScores: extra?.lastScores ?? null,
    wentOut: extra?.wentOut ?? null,
  };
}

function ok(result: SkipBeauxResult): SkipBeauxState {
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

function err(result: SkipBeauxResult): string {
  if (!('error' in result)) assert.fail('expected an error');
  return result.error;
}

describe('skip-beaux', () => {
  it('builds a 162-card deck and deals stock piles by player count', () => {
    const deck = freshDeck();
    assert.equal(deck.length, 162);
    assert.equal(new Set(deck).size, 162);
    assert.ok(deck.every(isCard));
    assert.equal(stockSize(1), 30);
    assert.equal(stockSize(4), 30);
    assert.equal(stockSize(5), 20);
    const two = createSkipBeauxState([{ id: 'ada' }, { id: 'bea' }], { deck });
    assert.equal(two.stocks.ada?.length, 30);
    assert.equal(two.stocks.bea?.length, 30);
    assert.equal(two.hands.ada?.length, 5);
    assert.equal(two.hands.bea?.length, 0);
    assert.equal(two.turn, 'ada');
    assert.equal(two.draw.length, 162 - 60 - 5);
    const five = createSkipBeauxState(['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })), { deck: freshDeck() });
    assert.equal(five.stocks.a?.length, 20);
    const waiting = createSkipBeauxState([{ id: 'ada' }], { waiting: true });
    assert.equal(waiting.phase, 'waiting');
    const solo = createSkipBeauxState([{ id: 'ada' }], { deck: freshDeck() });
    assert.equal(solo.phase, 'play');
    assert.equal(solo.stocks.ada?.length, 30);
    assert.equal(solo.hands.ada?.length, 5);
  });

  it('builds piles from 1, accepts a Beaux, and clears a finished 12', () => {
    const state = table({ hands: { ada: ['2#1', 'B#1', '1#1'], bea: [] } });
    assert.equal(canBuild('2#1', state.buildings[0]!), false);
    assert.match(err(playBuilding(state, 'ada', { zone: 'hand', card: '2#1' }, 0, named)), /1 or a Wild/);
    const started = ok(playBuilding(state, 'ada', { zone: 'hand', card: '1#1' }, 0, named));
    assert.equal(neededRank(started.buildings[0]!), 2);
    const wild = ok(playBuilding(started, 'ada', { zone: 'hand', card: 'B#1' }, 0, named));
    assert.equal(wild.buildings[0]?.cards.length, 2);
    assert.equal(neededRank(wild.buildings[0]!), 3);
    const almost: Pile = { cards: ['1#1', '2#1', '3#1', '4#1', '5#1', '6#1', '7#1', '8#1', '9#1', '10#1', '11#1'] };
    const finishing = table({
      hands: { ada: ['12#1', '9#2'], bea: [] },
      buildings: [almost, { cards: [] }, { cards: [] }, { cards: [] }],
    });
    const done = ok(playBuilding(finishing, 'ada', { zone: 'hand', card: '12#1' }, 0, named));
    assert.equal(done.buildings[0]?.cards.length, 0);
    assert.equal(done.completed.length, 12);
  });

  it('plays the stock top and ends the game when the stock is empty', () => {
    const state = table({
      hands: { ada: ['4#1'], bea: [] },
      stocks: { ada: ['8#1', '1#1'], bea: ['2#1', '3#1', '4#2'] },
    });
    const played = ok(playBuilding(state, 'ada', { zone: 'stock' }, 0, named));
    assert.equal(played.stocks.ada?.at(-1), '8#1');
    assert.equal(played.turn, 'ada');
    assert.equal(played.phase, 'play');
    const out = table({
      hands: { ada: [], bea: [] },
      stocks: { ada: ['1#1'], bea: ['2#1', '3#1', '4#2'] },
    });
    const won = ok(playBuilding(out, 'ada', { zone: 'stock' }, 0, named));
    assert.equal(won.phase, 'gameOver');
    assert.equal(won.wentOut, 'ada');
    assert.equal(won.totals.ada, 0);
    assert.deepEqual(winnerIds(won), ['ada']);
  });

  it('draws five after playing the hand, and a discard ends the turn', () => {
    const played = ok(
      playBuilding(
        table({
          hands: { ada: ['1#1'], bea: [] },
          draw: ['2#1', '3#1', '4#1', '5#1', '6#1'],
        }),
        'ada',
        { zone: 'hand', card: '1#1' },
        0,
        named,
      ),
    );
    assert.deepEqual(played.hands.ada, ['2#1', '3#1', '4#1', '5#1', '6#1']);
    assert.equal(played.turn, 'ada');
    const passed = ok(
      discardCard(
        table({
          hands: { ada: ['5#1'], bea: [] },
          draw: ['1#1', '2#1', '3#1', '4#1', '6#1'],
        }),
        'ada',
        '5#1',
        2,
        named,
      ),
    );
    assert.equal(passed.turn, 'bea');
    assert.equal(passed.hands.ada?.length, 0);
    assert.equal(passed.discards.ada?.[2]?.cards.at(-1), '5#1');
    assert.equal(passed.hands.bea?.length, 5);
    assert.match(err(endTurn(table({ hands: { ada: ['5#1'], bea: [] } }), 'ada', named)), /Discard/);
    const empty = ok(endTurn(table({ hands: { ada: [], bea: [] }, draw: ['7#1'] }), 'ada', named));
    assert.equal(empty.turn, 'bea');
    assert.equal(empty.hands.bea?.[0], '7#1');
  });

  it('reshuffles finished piles and ends when the stock is cleared', () => {
    const recycled = ok(
      discardCard(
        table({
          hands: { ada: ['5#1'], bea: [] },
          draw: [],
          completed: ['1#1', '2#1'],
        }),
        'ada',
        '5#1',
        0,
        named,
      ),
    );
    assert.equal(recycled.completed.length, 0);
    assert.equal(recycled.hands.bea?.length, 2);
    const solo = ok(
      playBuilding(
        table({
          order: ['ada'],
          hands: { ada: [] },
          stocks: { ada: ['1#1'] },
          discards: { ada: slots() },
          totals: { ada: 0 },
        }),
        'ada',
        { zone: 'stock' },
        0,
        [{ id: 'ada', name: 'Ada' }],
      ),
    );
    assert.equal(solo.phase, 'gameOver');
    assert.deepEqual(winnerIds(solo), ['ada']);
    const finished = ok(
      playBuilding(
        table({
          hands: { ada: [], bea: [] },
          stocks: { ada: ['1#1'], bea: ['2#1'] },
        }),
        'ada',
        { zone: 'stock' },
        0,
        named,
      ),
    );
    assert.equal(finished.phase, 'gameOver');
    assert.deepEqual(winnerIds(finished), ['ada']);
    assert.match(err(dealNext(finished, named)), /still going/);
  });

  it('repairs a broken game and leaves a healthy one untouched', () => {
    const players = [createPlayer('Ada'), createPlayer('Bea')];
    const game = { ...createGame({ name: 'Skip-Beaux', templateId: 'skip-beaux', players }), skipBeaux: null };
    const repaired = ensureSkipBeauxState(game);
    assert.equal(repaired.skipBeaux?.phase, 'play');
    assert.equal(repaired.skipBeaux?.hands[players[0].id]?.length, 5);
    assert.equal(ensureSkipBeauxState(repaired), repaired);
    const waiting = createSkipBeauxState([{ id: players[0].id }], { waiting: true });
    const held = {
      ...createGame({ name: 'Skip-Beaux', templateId: 'skip-beaux', players }),
      skipBeaux: waiting,
    };
    assert.equal(ensureSkipBeauxState(held), held);
    const dealt = ok(dealGame(players));
    assert.equal(dealt.order.length, 2);
    const template = getTemplate('skip-beaux');
    assert.ok(template);
    const finished: SkipBeauxState = {
      ...(repaired.skipBeaux as SkipBeauxState),
      phase: 'gameOver',
      turn: null,
      wentOut: players[0].id,
    };
    const snapshot = calculate({ ...repaired, skipBeaux: finished }, template);
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
  });
});

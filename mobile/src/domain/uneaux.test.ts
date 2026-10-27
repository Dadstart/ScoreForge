import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createGame, createPlayer } from './models';
import { calculate } from './scoreCalculator';
import { getTemplate } from './templates';
import {
  callUneaux,
  canPlayCard,
  cardPoints,
  catchUneaux,
  chooseColor,
  createUneauxState,
  dealNext,
  drawCard,
  ensureUneauxState,
  freshDeck,
  kindOf,
  passTurn,
  playCard,
  winnerIds,
  type UneauxResult,
  type UneauxState,
} from './uneaux';

const named = [
  { id: 'ada', name: 'Ada' },
  { id: 'bea', name: 'Bea' },
  { id: 'cy', name: 'Cy' },
];

function play(extra?: Partial<UneauxState>): UneauxState {
  const order = extra?.order ?? ['ada', 'bea'];
  return {
    order,
    hands: extra?.hands ?? { ada: ['R5#1'], bea: ['Y1#1'] },
    stock: extra?.stock ?? ['G2#1'],
    discard: extra?.discard ?? ['R3#1'],
    color: extra?.color === undefined ? 'red' : extra.color,
    direction: extra?.direction ?? 1,
    dealer: extra?.dealer ?? order.length - 1,
    turn: extra?.turn === undefined ? order[0] ?? null : extra.turn,
    phase: extra?.phase ?? 'play',
    handNumber: 1,
    totals: extra?.totals ?? Object.fromEntries(order.map((id) => [id, 0])),
    drawn: extra?.drawn ?? null,
    pendingCall: extra?.pendingCall ?? null,
    colorFrom: extra?.colorFrom ?? null,
    lastAction: null,
    lastScores: null,
    wentOut: null,
  };
}

function ok(result: UneauxResult): UneauxState {
  if ('error' in result) assert.fail(result.error);
  return result.state;
}

function err(result: UneauxResult): string {
  if (!('error' in result)) assert.fail('expected an error');
  return result.error;
}

function deckStarting(prefix: readonly string[]): string[] {
  const used = new Set(prefix);
  return [...prefix, ...freshDeck().filter((card) => !used.has(card))];
}

describe('uneaux', () => {
  it('builds a 108-card deck and deals seven cards', () => {
    const deck = freshDeck();
    assert.equal(deck.length, 108);
    assert.equal(new Set(deck).size, 108);
    assert.equal(cardPoints('R7#1'), 7);
    assert.equal(cardPoints('GS#1'), 20);
    assert.equal(cardPoints('W#1'), 50);
    const dealt = createUneauxState([{ id: 'ada' }, { id: 'bea' }], { deck: freshDeck() });
    assert.equal(dealt.hands.ada?.length, 7);
    assert.equal(dealt.hands.bea?.length, 7);
    assert.equal(dealt.discard.length, 1);
    assert.equal(dealt.turn, 'ada');
    assert.equal(createUneauxState([{ id: 'ada' }]).phase, 'waiting');
  });

  it('applies an action card that starts the discard', () => {
    const skip = createUneauxState(named.slice(0, 2), { deck: deckStarting(['R0#1', 'Y0#1', 'G0#1', 'B0#1', 'R1#1', 'Y1#1', 'G1#1', 'B1#1', 'R1#2', 'Y1#2', 'G1#2', 'B1#2', 'R2#1', 'Y2#1', 'RS#1']) });
    assert.equal(skip.discard.at(-1), 'RS#1');
    assert.equal(skip.turn, 'bea');
    const reversed = createUneauxState(named.slice(0, 2), {
      deck: deckStarting(['R0#1', 'Y0#1', 'G0#1', 'B0#1', 'R1#1', 'Y1#1', 'G1#1', 'B1#1', 'R1#2', 'Y1#2', 'G1#2', 'B1#2', 'R2#1', 'Y2#1', 'RV#1']),
    });
    assert.equal(reversed.direction, -1);
    assert.equal(reversed.turn, 'bea');
    const wild = createUneauxState(named.slice(0, 2), {
      deck: deckStarting(['R0#1', 'Y0#1', 'G0#1', 'B0#1', 'R1#1', 'Y1#1', 'G1#1', 'B1#1', 'R1#2', 'Y1#2', 'G1#2', 'B1#2', 'R2#1', 'Y2#1', 'W#1']),
    });
    assert.equal(wild.phase, 'color');
    assert.equal(wild.colorFrom, 'upcard');
    const buried = createUneauxState(named.slice(0, 2), {
      deck: deckStarting(['R0#1', 'Y0#1', 'G0#1', 'B0#1', 'R1#1', 'Y1#1', 'G1#1', 'B1#1', 'R1#2', 'Y1#2', 'G1#2', 'B1#2', 'R2#1', 'Y2#1', 'F#1', 'G5#1']),
    });
    assert.equal(buried.discard.at(-1), 'G5#1');
    assert.equal(buried.stock.at(-1), 'F#1');
  });

  it('plays a match, skips, reverses, and draws two', () => {
    const state = play({ hands: { ada: ['R5#1', 'YS#1', 'GV#1'], bea: ['Y1#1'], cy: ['B2#1'] }, order: ['ada', 'bea', 'cy'], discard: ['R3#1'] });
    assert.equal(canPlayCard(state, 'ada', 'R5#1'), true);
    assert.equal(canPlayCard(state, 'ada', 'B9#1'), false);
    const played = ok(playCard(state, 'ada', 'R5#1', named));
    assert.equal(played.turn, 'bea');
    assert.equal(played.discard.at(-1), 'R5#1');
    const skipped = ok(playCard({ ...state, hands: { ...state.hands, ada: ['RS#1', 'R4#1'] } }, 'ada', 'RS#1', named));
    assert.equal(skipped.turn, 'cy');
    const backwards = ok(playCard({ ...state, hands: { ...state.hands, ada: ['RV#1', 'R4#1'] } }, 'ada', 'RV#1', named));
    assert.equal(backwards.direction, -1);
    assert.equal(backwards.turn, 'cy');
    const again = ok(
      playCard(play({ hands: { ada: ['RV#1', 'R4#1'], bea: ['Y1#1'] }, discard: ['R3#1'] }), 'ada', 'RV#1', named),
    );
    assert.equal(again.turn, 'ada');
    const drawn = ok(
      playCard(
        play({
          hands: { ada: ['RD#1', 'R4#1'], bea: ['Y1#1'], cy: ['B2#1'] },
          order: ['ada', 'bea', 'cy'],
          stock: ['G8#1', 'G9#1', 'Y8#1'],
          discard: ['R3#1'],
        }),
        'ada',
        'RD#1',
        named,
      ),
    );
    assert.deepEqual(drawn.hands.bea, ['Y1#1', 'G8#1', 'G9#1']);
    assert.equal(drawn.turn, 'cy');
    assert.match(err(playCard(state, 'ada', 'YS#1', named)), /match/);
  });

  it('names a color and allows a draw four only without that color', () => {
    const wild = play({ hands: { ada: ['W#1', 'R4#1'], bea: ['Y1#1'] }, discard: ['G2#1'], color: 'green' });
    const naming = ok(playCard(wild, 'ada', 'W#1', named));
    assert.equal(naming.phase, 'color');
    const chosen = ok(chooseColor(naming, 'ada', 'blue', named));
    assert.equal(chosen.color, 'blue');
    assert.equal(chosen.turn, 'bea');
    const blocked = play({ hands: { ada: ['F#1', 'R4#1'], bea: ['Y1#1'] }, discard: ['R9#1'], color: 'red' });
    assert.match(err(playCard(blocked, 'ada', 'F#1', named)), /draw four/);
    const allowed = play({
      hands: { ada: ['F#1', 'Y4#1'], bea: ['G1#1'], cy: ['B2#1'] },
      order: ['ada', 'bea', 'cy'],
      discard: ['R9#1'],
      color: 'red',
      stock: ['G3#1', 'G4#1', 'G5#1', 'G6#1'],
    });
    const played = ok(playCard(allowed, 'ada', 'F#1', named));
    const after = ok(chooseColor(played, 'ada', 'yellow', named));
    assert.equal(after.hands.bea?.length, 5);
    assert.equal(after.turn, 'cy');
    const up = play({ phase: 'color', color: null, colorFrom: 'upcard', discard: ['W#1'], hands: { ada: ['B7#1'], bea: ['Y1#1'] } });
    const namedColor = ok(chooseColor(up, 'ada', 'blue', named));
    assert.equal(namedColor.phase, 'play');
    assert.equal(namedColor.turn, 'ada');
    assert.equal(canPlayCard(namedColor, 'ada', 'B7#1'), true);
  });

  it('draws and may pass, and says Uneaux or gets caught', () => {
    const state = play({ hands: { ada: ['Y9#1'], bea: ['G1#1'] }, discard: ['R3#1'], stock: ['B4#1', 'R8#1'] });
    const drawn = ok(drawCard(state, 'ada', named));
    assert.equal(drawn.drawn, 'B4#1');
    assert.equal(canPlayCard(drawn, 'ada', 'B4#1'), false);
    assert.match(err(playCard(drawn, 'ada', 'Y9#1', named)), /drew/);
    const match = ok(drawCard(play({ hands: { ada: ['G1#1'] }, discard: ['Y3#1'], stock: ['Y6#1'], color: 'yellow' }), 'ada', named));
    assert.equal(canPlayCard(match, 'ada', 'Y6#1'), true);
    const played = ok(playCard(match, 'ada', 'Y6#1', named));
    assert.equal(played.discard.at(-1), 'Y6#1');
    assert.equal(played.drawn, null);
    assert.equal(played.turn, 'bea');
    const symbol = ok(drawCard(play({ hands: { ada: ['G1#1'] }, discard: ['RS#1'], stock: ['YS#1'], color: 'red' }), 'ada', named));
    assert.equal(canPlayCard(symbol, 'ada', 'YS#1'), true);
    const passed = ok(passTurn(drawn, 'ada', named));
    assert.equal(passed.turn, 'bea');
    assert.equal(passed.drawn, null);
    const one = ok(
      playCard(
        play({ hands: { ada: ['R5#1', 'R6#1'], bea: ['Y1#1'] }, discard: ['R3#1'], stock: ['G2#1', 'G3#1', 'G4#1'] }),
        'ada',
        'R5#1',
        named,
      ),
    );
    assert.equal(one.pendingCall, 'ada');
    assert.equal(one.turn, 'bea');
    const called = ok(callUneaux(one, 'ada', named));
    assert.equal(called.pendingCall, null);
    const caught = ok(catchUneaux(one, 'bea', named));
    assert.equal(caught.hands.ada?.length, 3);
    assert.equal(caught.pendingCall, null);
    const forgiven = ok(playCard(play({ ...one, turn: 'bea', hands: { ada: ['R6#1'], bea: ['R7#1'] }, discard: ['R3#1'], pendingCall: 'ada' }), 'bea', 'R7#1', named));
    assert.equal(forgiven.pendingCall, null);
  });

  it('scores a hand and ends the game at 500', () => {
    const out = ok(
      playCard(
        play({
          hands: { ada: ['R5#1'], bea: ['W#1', 'RS#1', 'Y7#1'] },
          discard: ['R3#1'],
          stock: ['G1#1'],
        }),
        'ada',
        'R5#1',
        named,
      ),
    );
    assert.equal(out.phase, 'handOver');
    assert.equal(out.lastScores?.[0]?.points, 50 + 20 + 7);
    assert.equal(out.totals.ada, 77);
    const winning = play({
      hands: { ada: ['R5#1'], bea: ['W#1'] },
      totals: { ada: 450, bea: 100 },
      discard: ['R3#1'],
    });
    const over = ok(playCard(winning, 'ada', 'R5#1', named));
    assert.equal(over.phase, 'gameOver');
    assert.deepEqual(winnerIds(over), ['ada']);
    const tied = play({
      hands: { ada: ['R5#1'], bea: ['Y1#1'] },
      totals: { ada: 499, bea: 500 },
      discard: ['R3#1'],
    });
    const again = ok(playCard(tied, 'ada', 'R5#1', named));
    assert.equal(again.phase, 'handOver');
    const next = ok(dealNext(again, named));
    assert.equal(next.handNumber, 2);
    assert.equal(next.totals.ada, 500);
    assert.equal(next.totals.bea, 500);
  });

  it('reshuffles the buried discards and repairs only a broken game', () => {
    const state = play({
      hands: { ada: ['Y9#1'], bea: ['G1#1'] },
      discard: ['B2#1', 'B3#1', 'R4#1'],
      stock: [],
      color: 'red',
    });
    const drawn = ok(drawCard(state, 'ada', named));
    assert.equal(drawn.discard.at(-1), 'R4#1');
    assert.equal(drawn.hands.ada?.length, 2);
    assert.equal(drawn.stock.length, 1);
    const players = [createPlayer('Ada'), createPlayer('Bea')];
    const game = { ...createGame({ name: 'Uneaux', templateId: 'uneaux', players }), uneaux: null };
    const repaired = ensureUneauxState(game);
    assert.ok(repaired.uneaux?.phase === 'play' || repaired.uneaux?.phase === 'color');
    const up = repaired.uneaux?.discard.at(-1) ?? '';
    assert.equal(repaired.uneaux?.hands[players[0].id]?.length, kindOf(up) === 'D' ? 9 : 7);
    assert.equal(repaired.uneaux?.hands[players[1].id]?.length, 7);
    assert.equal(ensureUneauxState(repaired), repaired);
    const template = getTemplate('uneaux');
    assert.ok(template);
    const finished: UneauxState = {
      ...(repaired.uneaux as UneauxState),
      phase: 'gameOver',
      turn: null,
      totals: { [players[0].id]: 520, [players[1].id]: 40 },
    };
    const snapshot = calculate({ ...repaired, uneaux: finished }, template);
    assert.equal(snapshot.isComplete, true);
    assert.equal(snapshot.winnerName, 'Ada');
  });
});

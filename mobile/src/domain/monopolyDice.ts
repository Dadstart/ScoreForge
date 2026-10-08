import { fillRandom } from './secureRandom';

export const GO_PAYOUT = 200;

export type DiceFaces = [number, number];

export type DiceRoll = {
  faces: DiceFaces;
  total: number;
  doubles: boolean;
};

export type BoardStep = {
  index: number;
  passedGo: boolean;
};

function unit(): number {
  const buffer = new Uint32Array(1);
  fillRandom(buffer);
  return (buffer[0] ?? 0) / 0x1_0000_0000;
}

function face(sample: number): number {
  const value = Math.floor(sample * 6);
  return value >= 6 ? 6 : value + 1;
}

/** Two dice, 1 through 6. */
export function rollMonopolyDice(sample: () => number = unit): DiceRoll {
  const first = face(sample());
  const second = face(sample());
  return {
    faces: [first, second],
    total: first + second,
    doubles: first === second,
  };
}

/** Move clockwise. Landing on or passing Go collects salary, except when the trip starts on Go. */
export function boardStep(from: number, steps: number): BoardStep {
  const start = ((Math.trunc(from) % 40) + 40) % 40;
  const travel = Math.max(0, Math.trunc(steps));
  return {
    index: (start + travel) % 40,
    passedGo: start > 0 && start + travel >= 40,
  };
}

import * as Haptics from 'expo-haptics';
import { diceSettleMs } from '../components/OpolyDice';

/** Light taps while the dice tumble, ending before they settle. */
const RATTLE_AT = [0, 90, 180, 290, 420, 580, 780, 1020, 1300, 1580];

let pending: ReturnType<typeof setTimeout>[] = [];

function buzz(style: Haptics.ImpactFeedbackStyle) {
  void Haptics.impactAsync(style).catch(() => {
    // Haptics are unavailable when the device has them switched off.
  });
}

export function stopDiceRollHaptic(): void {
  for (const timer of pending) clearTimeout(timer);
  pending = [];
}

/** A rattle for the tumble, then a firmer tap when the dice land. */
export function playDiceRollHaptic(): void {
  stopDiceRollHaptic();
  const settle = diceSettleMs();
  if (settle === 0) {
    buzz(Haptics.ImpactFeedbackStyle.Medium);
    return;
  }
  for (const at of RATTLE_AT) {
    if (at >= settle) break;
    pending.push(setTimeout(() => buzz(Haptics.ImpactFeedbackStyle.Light), at));
  }
  pending.push(setTimeout(() => buzz(Haptics.ImpactFeedbackStyle.Medium), settle));
}

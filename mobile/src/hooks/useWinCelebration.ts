import { useCallback, useRef, useState } from 'react';
import type { GameSnapshot } from '../domain/scoreCalculator';

/**
 * Shows fireworks when a game newly becomes complete with a winner.
 * Suppress mid-write snapshots (reset/undo) so celebration does not re-fire.
 */
export function useWinCelebration() {
  const [showCelebration, setShowCelebration] = useState(false);
  const wasComplete = useRef(false);
  const suppressCelebration = useRef(false);

  const onSnapshot = useCallback((snap: GameSnapshot | null) => {
    if (!snap) return;
    if (!snap.isComplete) {
      setShowCelebration(false);
      wasComplete.current = false;
      return;
    }
    if (!wasComplete.current && !suppressCelebration.current && snap.winnerName) {
      setShowCelebration(true);
    }
    wasComplete.current = true;
  }, []);

  const dismissCelebration = useCallback(() => setShowCelebration(false), []);

  const beginSuppress = useCallback(() => {
    suppressCelebration.current = true;
    setShowCelebration(false);
  }, []);

  const endSuppress = useCallback((complete: boolean) => {
    wasComplete.current = complete;
    suppressCelebration.current = false;
  }, []);

  /** Call when locally applying a mutation that may complete the game. */
  const noteLocalResult = useCallback((snap: GameSnapshot) => {
    if (!snap.isComplete) {
      setShowCelebration(false);
      wasComplete.current = false;
      return false;
    }
    const shouldCelebrate =
      !wasComplete.current && !suppressCelebration.current && snap.winnerName != null;
    wasComplete.current = true;
    if (shouldCelebrate) setShowCelebration(true);
    return shouldCelebrate;
  }, []);

  return {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  };
}

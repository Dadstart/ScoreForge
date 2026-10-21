import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { SaveQueue } from '../domain/saveQueue';
import { getTemplate, type GameTemplate } from '../domain/templates';
import { auth } from '../firebase/app';
import { loadDisplayName } from '../storage/displayNameStore';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { loadSoloUndo, recallSoloUndo } from '../storage/soloUndoStore';
import { useWinCelebration } from './useWinCelebration';
import type { GameSnapshot } from '../domain/scoreCalculator';

type LiveGameOptions = {
  /** Repair a loaded game once. Pass a stable function, such as a module export. */
  repair?: (game: Game) => Game;
  repairError?: string;
  /**
   * Kept for existing callers. Saves always show the next position immediately
   * and queue a move that arrives before the write finishes.
   */
  optimistic?: boolean;
};

/** This device's display name and anonymous Firebase uid. */
export function useDeviceIdentity(): { displayName: string; uid: string | null } {
  const [displayName, setDisplayName] = useState('');
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => {
    void loadDisplayName().then(setDisplayName);
  }, []);
  useEffect(() => onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null)), []);
  return { displayName, uid };
}

/**
 * Shared live-game shell: subscribe, identify this device's seat, repair, and save.
 * A move made while a save is in flight is queued and written from the latest board.
 */
export function useLiveGame(gameId: string, options?: LiveGameOptions) {
  const repair = options?.repair;
  const repairError = options?.repairError ?? 'Could not set up the game';
  const [game, setGame] = useState<Game | null>(null);
  const { displayName, uid } = useDeviceIdentity();
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(new SaveQueue<Game>());
  const latest = useRef<Game | null>(null);
  const serverGame = useRef<Game | null>(null);
  const heldRemote = useRef<Game | null>(null);
  const draining = useRef(false);
  const saving = useRef(false);
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();

  const publish = (value: Game | null | ((current: Game | null) => Game | null)) => {
    const next = typeof value === 'function' ? value(latest.current) : value;
    latest.current = next;
    setGame(next);
  };

  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    saving.current = true;
    try {
      let job = queue.current.take();
      while (job) {
        try {
          const saved = await saveGame(job);
          serverGame.current = saved;
          queue.current.committed(saved.revision);
          if (!queue.current.hasPending) {
            const remote = heldRemote.current;
            heldRemote.current = null;
            publish(remote && remote.revision > saved.revision ? remote : saved);
          }
          setError(null);
        } catch (err) {
          queue.current.failed();
          heldRemote.current = null;
          if (serverGame.current) publish(serverGame.current);
          setError(err instanceof Error ? err.message : 'Autosave failed');
          break;
        }
        job = queue.current.take();
      }
    } finally {
      draining.current = false;
      saving.current = queue.current.saving || queue.current.hasPending;
      if (queue.current.hasPending) void drain();
    }
  };

  const commit = (
    recipe: (current: Game) => Game | null,
    celebrate: boolean | ((next: Game) => boolean) = false,
  ): boolean => {
    const base = latest.current;
    if (!base) return false;
    const next = recipe(base);
    if (!next) return false;
    latest.current = next;
    setGame(next);
    const tmpl = getTemplate(next.templateId);
    const shouldCelebrate = typeof celebrate === 'function' ? celebrate(next) : celebrate;
    if (shouldCelebrate && tmpl) noteLocalResult(calculate(next, tmpl));
    queue.current.enqueue(next);
    saving.current = true;
    void drain();
    return true;
  };

  const persist = async (next: Game, celebrate = false) => {
    commit(() => next, celebrate);
  };

  useEffect(() => {
    queue.current = new SaveQueue();
    latest.current = null;
    serverGame.current = null;
    heldRemote.current = null;
    saving.current = false;
    let cancel = false;
    void loadSoloUndo(gameId).then(() => {
      if (cancel || queue.current.saving || queue.current.hasPending) return;
      publish((current) => (current ? recallSoloUndo(current) : current));
    });
    const stop = subscribeGame(
      gameId,
      (found) => {
        if (cancel) return;
        if (!found) {
          if (!queue.current.saving && !queue.current.hasPending) publish(null);
          return;
        }
        if (queue.current.saving || queue.current.hasPending) {
          heldRemote.current = found;
          return;
        }
        serverGame.current = found;
        publish((current) => preferNewerGame(current, found));
        const tmpl = getTemplate(found.templateId);
        if (tmpl) onSnapshot(calculate(found, tmpl));
      },
      (err) => setError(err.message),
    );
    return () => {
      cancel = true;
      stop();
    };
  }, [gameId, onSnapshot]);

  const template = game ? getTemplate(game.templateId) : undefined;
  const snapshot = useMemo(
    () => (game && template ? calculate(game, template) : null),
    [game, template],
  );
  const localPlayerId = useMemo(
    () => (game ? findLocalPlayerId(game, displayName, uid) : null),
    [game, displayName, uid],
  );

  useEffect(() => {
    const current = latest.current;
    if (!current || !repair) return;
    const next = repair(current);
    if (next === current) return;
    commit((base) => {
      const repaired = repair(base);
      return repaired === base ? null : repaired;
    });
    // commit is recreated each render and closes over the latest repair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, repair, repairError]);

  return {
    game,
    setGame: publish,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    saving,
    persist,
    commit,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  };
}

export type LiveTemplate = GameTemplate;
export type LiveSnapshot = GameSnapshot;

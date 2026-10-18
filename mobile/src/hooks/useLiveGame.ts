import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { findLocalPlayerId } from '../domain/localPlayer';
import type { Game } from '../domain/models';
import { calculate } from '../domain/scoreCalculator';
import { getTemplate, type GameTemplate } from '../domain/templates';
import { auth } from '../firebase/app';
import { loadDisplayName } from '../storage/displayNameStore';
import { preferNewerGame, saveGame, subscribeGame } from '../storage/gameStore';
import { useWinCelebration } from './useWinCelebration';
import type { GameSnapshot } from '../domain/scoreCalculator';

type LiveGameOptions = {
  /** Repair a loaded game once. Pass a stable function, such as a module export. */
  repair?: (game: Game) => Game;
  repairError?: string;
  /**
   * Show the next position before the save returns.
   * While that save is in flight, an older snapshot cannot roll the board back.
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
 * Solitaire passes `optimistic` so a drag stays on screen until the write lands.
 */
export function useLiveGame(gameId: string, options?: LiveGameOptions) {
  const repair = options?.repair;
  const repairError = options?.repairError ?? 'Could not set up the game';
  const optimistic = options?.optimistic ?? false;
  const [game, setGame] = useState<Game | null>(null);
  const { displayName, uid } = useDeviceIdentity();
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const serverGame = useRef<Game | null>(null);
  const {
    showCelebration,
    onSnapshot,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  } = useWinCelebration();

  useEffect(() => {
    return subscribeGame(
      gameId,
      (found) => {
        setGame((current) => {
          if (!found) return null;
          if (optimistic && saving.current && current && found.revision <= current.revision) return current;
          serverGame.current = found;
          return preferNewerGame(current, found);
        });
        if (found) {
          const tmpl = getTemplate(found.templateId);
          if (tmpl) onSnapshot(calculate(found, tmpl));
        }
      },
      (err) => setError(err.message),
    );
  }, [gameId, onSnapshot, optimistic]);

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
    if (!game || !repair) return;
    const next = repair(game);
    if (next === game) return;
    void saveGame(next)
      .then((saved) => setGame((current) => preferNewerGame(current, saved)))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : repairError);
      });
  }, [game, repair, repairError]);

  const persist = async (next: Game, celebrate = false) => {
    if (!template || saving.current) return;
    saving.current = true;
    if (optimistic) setGame(next);
    const snap = calculate(next, template);
    if (celebrate) noteLocalResult(snap);
    try {
      const saved = await saveGame(next);
      serverGame.current = saved;
      setGame((current) => preferNewerGame(current, saved));
      setError(null);
    } catch (err) {
      if (optimistic && serverGame.current) setGame(serverGame.current);
      setError(err instanceof Error ? err.message : 'Autosave failed');
    } finally {
      saving.current = false;
    }
  };

  return {
    game,
    setGame,
    template,
    snapshot,
    localPlayerId,
    error,
    setError,
    saving,
    persist,
    showCelebration,
    dismissCelebration,
    beginSuppress,
    endSuppress,
    noteLocalResult,
  };
}

export type LiveTemplate = GameTemplate;
export type LiveSnapshot = GameSnapshot;

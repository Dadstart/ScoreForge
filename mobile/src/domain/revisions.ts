import type { Game } from './models';

/** The copy this device saved is older than the one stored in Firestore. */
export class StaleGameError extends Error {
  constructor() {
    super('Someone else updated this game. It will refresh — try that again.');
    this.name = 'StaleGameError';
  }
}

/**
 * Revision the next write should store.
 * `remoteRevision` is the revision on the server document, or 0 when the field is missing.
 * The write is rejected when this device did not base its edit on that revision.
 */
export function nextSavedRevision(baseRevision: number, remoteRevision: number): number {
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    throw new StaleGameError();
  }
  if (!Number.isInteger(remoteRevision) || remoteRevision < 0) {
    throw new StaleGameError();
  }
  if (remoteRevision !== baseRevision) throw new StaleGameError();
  return remoteRevision + 1;
}

/** Keep the game with the higher revision so a late response cannot roll the screen backwards. */
export function preferNewerGame(current: Game | null, incoming: Game): Game {
  if (!current || incoming.revision >= current.revision) return incoming;
  return current;
}

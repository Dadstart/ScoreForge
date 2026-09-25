import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'scoreforge.settings';

export type Settings = {
  showMonopolyBoard: boolean;
};

export const defaultSettings: Settings = {
  showMonopolyBoard: false,
};

type Listener = (settings: Settings) => void;

let current: Settings = { ...defaultSettings };
let version = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener(current);
}

function parseSettings(raw: string | null): Settings {
  if (!raw) return { ...defaultSettings };
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (!parsed || typeof parsed !== 'object') return { ...defaultSettings };
    return {
      ...defaultSettings,
      showMonopolyBoard: parsed.showMonopolyBoard === true,
    };
  } catch {
    return { ...defaultSettings };
  }
}

function ensureLoaded(): Promise<void> {
  if (!loading) {
    const seen = version;
    loading = AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (version === seen) {
        current = parseSettings(raw);
        notify();
      }
    });
  }
  return loading;
}

export function getSettings(): Settings {
  return current;
}

export function loadSettings(): Promise<Settings> {
  return ensureLoaded().then(() => current);
}

export function subscribeSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  await ensureLoaded();
  version += 1;
  current = { ...current, ...patch };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  notify();
  return current;
}

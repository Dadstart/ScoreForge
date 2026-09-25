import { useEffect, useState } from 'react';
import {
  defaultSettings,
  loadSettings,
  subscribeSettings,
  updateSettings,
  type Settings,
} from '../storage/settingsStore';

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(defaultSettings);

  useEffect(() => {
    const unsubscribe = subscribeSettings(setSettings);
    void loadSettings();
    return unsubscribe;
  }, []);

  return [settings, (patch) => void updateSettings(patch)];
}

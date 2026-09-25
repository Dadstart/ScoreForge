import { useEffect, useState } from 'react';
import {
  getSettings,
  loadSettings,
  subscribeSettings,
  updateSettings,
  type Settings,
} from '../storage/settingsStore';

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(getSettings);

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeSettings((value) => {
      if (active) setSettings(value);
    });
    void loadSettings().then((value) => {
      if (active) setSettings(value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return [settings, (patch) => void updateSettings(patch)];
}

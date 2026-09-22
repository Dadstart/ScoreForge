import AsyncStorage from '@react-native-async-storage/async-storage';

const DISPLAY_NAME_KEY = 'scoreforge.displayName';

export async function loadDisplayName(): Promise<string> {
  return (await AsyncStorage.getItem(DISPLAY_NAME_KEY)) ?? '';
}

export async function saveDisplayName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) {
    await AsyncStorage.removeItem(DISPLAY_NAME_KEY);
    return;
  }
  await AsyncStorage.setItem(DISPLAY_NAME_KEY, trimmed);
}

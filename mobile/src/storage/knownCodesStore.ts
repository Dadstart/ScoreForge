import AsyncStorage from '@react-native-async-storage/async-storage';

const KNOWN_CODES_KEY = 'scoreforge.knownShareCodes';

export async function loadKnownShareCodes(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KNOWN_CODES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function rememberShareCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return;
  const codes = await loadKnownShareCodes();
  if (codes.includes(normalized)) return;
  codes.unshift(normalized);
  await AsyncStorage.setItem(KNOWN_CODES_KEY, JSON.stringify(codes));
}

export async function forgetShareCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const codes = await loadKnownShareCodes();
  await AsyncStorage.setItem(
    KNOWN_CODES_KEY,
    JSON.stringify(codes.filter((c) => c !== normalized)),
  );
}

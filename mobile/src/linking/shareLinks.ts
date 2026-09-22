import * as Linking from 'expo-linking';
import { normalizeShareCode } from '../domain/models';

/** Deep link path guests open after scanning the QR code. */
export function createJoinShareUrl(shareCode: string): string {
  const code = normalizeShareCode(shareCode);
  return Linking.createURL('join', {
    queryParams: { code },
  });
}

/** Extract a share code from a ScoreForge join URL, if present. */
export function parseJoinShareCode(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const path = (parsed.path ?? '').replace(/^\//, '').toLowerCase();
    const fromQuery = parsed.queryParams?.code;
    const codeRaw = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
    if (typeof codeRaw === 'string' && codeRaw.trim()) {
      const code = normalizeShareCode(codeRaw);
      return code.length >= 4 ? code : null;
    }
    // Fallback: scoreforge://join/ABC123
    if (path.startsWith('join/')) {
      const code = normalizeShareCode(path.slice('join/'.length));
      return code.length >= 4 ? code : null;
    }
  } catch {
    return null;
  }
  return null;
}

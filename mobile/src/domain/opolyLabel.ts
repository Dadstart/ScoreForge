/** Advances for DM Sans at weight 800 and 17px. */
const GLYPH_WIDTH: Record<string, number> = {
  A: 12.04, B: 10.83, C: 12.56, D: 12.05, E: 9.89, F: 9.43, G: 13.21, H: 12.12, I: 4.61,
  J: 9.18, K: 11.08, L: 9.49, M: 15.08, N: 12.38, O: 13.36, P: 10.42, Q: 13.36, R: 10.71,
  S: 10.25, T: 10.15, U: 11.64, V: 11.98, W: 17.29, X: 11.37, Y: 10.78, Z: 9.77,
  a: 9.94, b: 11.13, c: 10.3, d: 11.13, e: 10.23, f: 6.27, g: 10.13, h: 10.47, i: 4.64,
  j: 4.66, k: 9.83, l: 4.52, m: 16, n: 10.47, o: 10.37, p: 11.13, q: 11.13, r: 6.92,
  s: 9.03, t: 7.33, u: 10.47, v: 9.57, w: 13.89, x: 9.71, y: 10.27, z: 8.3,
  '.': 4.27, '&': 13.26, ' ': 3.99, '🚂': 24,
};

/** Full name first, then shorter forms that still name the property. */
export function labelChoices(name: string, shortName: string): string[] {
  const choices: string[] = [];
  const add = (value: string) => {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text && !choices.includes(text)) choices.push(text);
  };
  add(name.replace(/\bAvenue\b/g, 'Ave.'));
  add(soften(name));
  add(dropKind(name));
  for (const extra of extras(name)) add(extra);
  add(shortName);
  return choices;
}

export type FittedLabel = {
  lines: string[];
  fontSize: number;
  lineHeight: number;
};

/**
 * Largest readable label that fits. A name stays on one line when that line fits.
 * Wrapping breaks only on spaces. If a word still will not fit, a shorter name is used.
 */
export function fitBoardLabel(
  name: string,
  shortName: string,
  bounds: { width: number; height: number },
  startSize: number,
  maxLines = 3,
): FittedLabel {
  const start = Math.max(8, Math.round(startSize));
  const oneLineMin = Math.min(11, start);
  const wrapMin = Math.min(10, start);
  for (const candidate of labelChoices(name, shortName)) {
    const single = fitSingleLine(candidate, bounds, start, oneLineMin);
    if (single) return single;
    if (maxLines > 1) {
      const wrapped = fitWrapped(candidate, bounds, start, wrapMin, maxLines);
      if (wrapped) return wrapped;
    }
  }
  const fallback = labelChoices(name, shortName).at(-1) ?? name;
  return fitSingleLine(fallback, bounds, wrapMin, wrapMin)
    ?? { lines: [fallback], fontSize: wrapMin, lineHeight: lineHeight(wrapMin) };
}

export function textWidth(text: string, fontSize: number) {
  const scale = fontSize / 17;
  let width = 0;
  for (const ch of text) width += (GLYPH_WIDTH[ch] ?? 10.2) * scale;
  return width;
}

export function fitSize(text: string, maxWidth: number, start: number) {
  let size = start;
  while (size > 7 && textWidth(text, size) > maxWidth) size -= 1;
  return size;
}

export type CompactLabel = {
  text: string;
  fontSize: number;
  /** Runs along the longer side of a short property, so top and bottom spaces turn sideways. */
  vertical: boolean;
};

/** Largest type used for a property name. Bigger type forces names down to stubs. */
const MAX_NAME_FONT = 14;
const MIN_NAME_FONT = 8;

/**
 * Property name on one line, in the reading direction for its side.
 * The board rotates this so the baseline faces that side.
 */
export function facingPropertyLabel(
  name: string,
  shortName: string,
  width: number,
  height: number,
): { text: string; fontSize: number } | null {
  if (width < 8 || height < 8) return null;
  const choices = labelChoices(name, shortName);
  for (const text of choices) {
    const fontSize = fontThatFits(text, width, height);
    if (fontSize != null) return { text, fontSize };
  }
  const text = choices.at(-1) ?? name;
  return { text, fontSize: MIN_NAME_FONT };
}

/**
 * A property name that stays readable as the board shrinks.
 * The fullest name that fits wins, at a size no larger than the cell can hold.
 * Top and bottom spaces turn the name along the property when that is what fits.
 */
export function compactPropertyLabel(
  name: string,
  shortName: string,
  width: number,
  height: number,
): CompactLabel | null {
  if (width < 8 || height < 8) return null;
  const choices = labelChoices(name, shortName);
  let best: CompactLabel & { index: number } | null = null;
  for (let index = 0; index < choices.length; index += 1) {
    const text = choices[index] ?? '';
    const across = fontThatFits(text, width, height);
    const along = fontThatFits(text, height, width);
    const options: CompactLabel[] = [];
    if (across != null) options.push({ text, fontSize: across, vertical: false });
    if (along != null) options.push({ text, fontSize: along, vertical: true });
    for (const option of options) {
      const fuller = best != null && index < best.index;
      const sameButLarger = best != null && index === best.index && option.fontSize > best.fontSize;
      const sameSizeLongAxis = best != null
        && index === best.index
        && option.fontSize === best.fontSize
        && option.vertical
        && height > width;
      if (!best || fuller || sameButLarger || sameSizeLongAxis) best = { ...option, index };
    }
  }
  if (best) return { text: best.text, fontSize: best.fontSize, vertical: best.vertical };
  const text = choices.at(-1) ?? name;
  return { text, fontSize: MIN_NAME_FONT, vertical: height >= width };
}

function fontThatFits(text: string, length: number, thickness: number): number | null {
  const cap = Math.min(MAX_NAME_FONT, Math.floor(thickness) - 1, Math.floor(length));
  for (let size = cap; size >= MIN_NAME_FONT; size -= 1) {
    if (textWidth(text, size) <= length) return size;
  }
  return null;
}

function fitSingleLine(
  text: string,
  bounds: { width: number; height: number },
  start: number,
  min: number,
): FittedLabel | null {
  for (let size = start; size >= min; size -= 1) {
    const height = lineHeight(size);
    if (textWidth(text, size) <= bounds.width && height <= bounds.height) {
      return { lines: [text], fontSize: size, lineHeight: height };
    }
  }
  return null;
}

function fitWrapped(
  text: string,
  bounds: { width: number; height: number },
  start: number,
  min: number,
  maxLines: number,
): FittedLabel | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  let best: FittedLabel | null = null;
  for (let size = start; size >= min; size -= 1) {
    if (words.some((word) => textWidth(word, size) > bounds.width)) continue;
    const lines = packWords(words, bounds.width, size);
    const height = lineHeight(size);
    if (lines.length < 2 || lines.length > maxLines || lines.length * height > bounds.height) continue;
    const tail = /^(Ave\.|Place|Pl|Railroad|RR|Company|Co|Gardens)$/.test(lines[lines.length - 1] ?? '');
    const bestTail = best ? /^(Ave\.|Place|Pl|Railroad|RR|Company|Co|Gardens)$/.test(best.lines[best.lines.length - 1] ?? '') : false;
    if (!best || lines.length < best.lines.length || (lines.length === best.lines.length && tail && !bestTail)) {
      best = { lines, fontSize: size, lineHeight: height };
    }
  }
  return best;
}

function packWords(words: string[], maxWidth: number, fontSize: number) {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function lineHeight(fontSize: number) {
  return Math.max(fontSize + 1, Math.round(fontSize * 1.1));
}

function soften(name: string) {
  return name
    .replace(/\bAvenue\b/g, 'Ave.')
    .replace(/\bPlace\b/g, 'Pl')
    .replace(/\bRailroad\b/g, 'RR')
    .replace(/\bCompany\b/g, 'Co');
}

function dropKind(name: string) {
  return name.replace(/\s+(Avenue|Place|Railroad|Company)$/, '');
}

function extras(name: string): string[] {
  if (name.startsWith('North Carolina')) return ['N. Carolina Ave.', 'N. Carolina'];
  if (name.startsWith('Pennsylvania Avenue')) return ['Penn Ave.'];
  if (name.startsWith('Pennsylvania Railroad')) return ['Penn RR'];
  if (name.startsWith('Mediterranean')) return ['Medit.'];
  if (name.startsWith('Connecticut')) return ['Conn.'];
  if (name.startsWith('St. Charles')) return ['St. Charles'];
  if (name.startsWith('St. James')) return ['St. James'];
  if (name.startsWith('Marvin Gardens')) return ['Marvin'];
  return [];
}

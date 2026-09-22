import { Platform, TextStyle } from 'react-native';

/** Felt-table night: deep green ink + brass, not generic blue/purple chrome. */
export const colors = {
  bg: '#0a100e',
  bgElevated: '#101816',
  surface: '#15201c',
  surfaceAlt: '#1c2a25',
  surfaceHover: '#243530',
  border: '#2c3d36',
  borderStrong: '#3d5248',
  text: '#f0f4f1',
  textDim: '#c5d0c9',
  muted: '#8a9a91',
  accent: '#d4a84b',
  accentPressed: '#b8903f',
  accentSoft: 'rgba(212, 168, 75, 0.16)',
  accentText: '#1a1408',
  danger: '#e86a5c',
  dangerSoft: 'rgba(232, 106, 92, 0.14)',
  success: '#6fbf8a',
  successSoft: 'rgba(111, 191, 138, 0.14)',
  wood: '#5c3a20',
  woodDark: '#3a2212',
  hole: '#1c120a',
  overlay: 'rgba(4, 8, 6, 0.72)',
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const webDisplay = Platform.OS === 'web' ? ('Fraunces, Georgia, serif' as const) : undefined;
const webBody = Platform.OS === 'web' ? ('"DM Sans", system-ui, sans-serif' as const) : undefined;

export const fonts = {
  display: webDisplay,
  body: webBody,
};

export const typography = {
  brand: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.text,
  } satisfies TextStyle,
  title: {
    fontFamily: fonts.display,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
  } satisfies TextStyle,
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.muted,
  } satisfies TextStyle,
  section: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  } satisfies TextStyle,
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
    color: colors.textDim,
  } satisfies TextStyle,
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  } satisfies TextStyle,
  button: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  } satisfies TextStyle,
  score: {
    fontFamily: fonts.display,
    fontSize: 44,
    fontWeight: '700',
    color: colors.text,
  } satisfies TextStyle,
  code: {
    fontFamily: fonts.body,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.accent,
  } satisfies TextStyle,
};

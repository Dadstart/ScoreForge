import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Game } from '../domain/models';

export type RootStackParamList = {
  Home: undefined;
  Setup: undefined;
  Join: { code?: string } | undefined;
  Board: { gameId: string };
  Cribbage: { gameId: string };
  Opoly: { gameId: string };
  Yaht: { gameId: string };
  Sorry: { gameId: string };
  Backgammon: { gameId: string };
  Checkers: { gameId: string };
  Chess: { gameId: string };
  Reversi: { gameId: string };
  ChineseCheckers: { gameId: string };
  Klondike: { gameId: string };
  Freecell: { gameId: string };
  Pyramid: { gameId: string };
  TriPeaks: { gameId: string };
  Spider: { gameId: string };
};

export function gameScreenForTemplate(
  templateId: string,
): 'Board' | 'Cribbage' | 'Opoly' | 'Yaht' | 'Sorry' | 'Backgammon' | 'Checkers' | 'Chess' | 'Reversi' | 'ChineseCheckers' | 'Klondike' | 'Freecell' | 'Pyramid' | 'TriPeaks' | 'Spider' {
  if (templateId === 'cribbage') return 'Cribbage';
  if (templateId === 'monopoly') return 'Opoly';
  if (templateId === 'yaht' || templateId === 'yahtzee') return 'Yaht';
  if (templateId === 'sorry') return 'Sorry';
  if (templateId === 'backgammon') return 'Backgammon';
  if (templateId === 'checkers') return 'Checkers';
  if (templateId === 'chess') return 'Chess';
  if (templateId === 'reversi') return 'Reversi';
  if (templateId === 'chinese-checkers') return 'ChineseCheckers';
  if (templateId === 'klondike') return 'Klondike';
  if (templateId === 'freecell') return 'Freecell';
  if (templateId === 'pyramid') return 'Pyramid';
  if (templateId === 'tripeaks') return 'TriPeaks';
  if (templateId === 'spider') return 'Spider';
  return 'Board';
}

export type Nav = NativeStackNavigationProp<RootStackParamList>;
export type BoardRoute = RouteProp<RootStackParamList, 'Board'>;
export type CribbageRoute = RouteProp<RootStackParamList, 'Cribbage'>;

export type SetupDraft = {
  templateId: string;
  name: string;
  playerNames: string[];
  targetScore?: number | null;
  maxRounds?: number | null;
};

export type { Game };

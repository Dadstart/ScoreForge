import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Game } from '../domain/models';

export type RootStackParamList = {
  Home: undefined;
  Setup: undefined;
  Join: { code?: string } | undefined;
  Board: { gameId: string };
  Cribbage: { gameId: string };
  Monopoly: { gameId: string };
  Yahtzee: { gameId: string };
  Sorry: { gameId: string };
  Checkers: { gameId: string };
  Settings: { gameId?: string } | undefined;
};

export function gameScreenForTemplate(
  templateId: string,
): 'Board' | 'Cribbage' | 'Monopoly' | 'Yahtzee' | 'Sorry' | 'Checkers' {
  if (templateId === 'cribbage') return 'Cribbage';
  if (templateId === 'monopoly') return 'Monopoly';
  if (templateId === 'yahtzee') return 'Yahtzee';
  if (templateId === 'sorry') return 'Sorry';
  if (templateId === 'checkers') return 'Checkers';
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

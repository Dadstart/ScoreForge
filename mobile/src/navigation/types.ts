import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { Game } from '../domain/models';

export type RootStackParamList = {
  Home: undefined;
  Setup: undefined;
  Join: { code?: string } | undefined;
  Board: { gameId: string };
  Cribbage: { gameId: string };
  Settings: undefined;
};

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

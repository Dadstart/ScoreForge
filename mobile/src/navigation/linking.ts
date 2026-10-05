import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { normalizeShareCode } from '../domain/models';
import type { RootStackParamList } from './types';

const prefix = Linking.createURL('/');

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'scoreforge://'],
  config: {
    screens: {
      Home: '',
      Join: {
        path: 'join',
        parse: {
          code: (code: string) => normalizeShareCode(code),
        },
      },
      Setup: 'setup',
      Board: 'board/:gameId',
      Cribbage: 'cribbage/:gameId',
      Monopoly: 'monopoly/:gameId',
      Yahtzee: 'yahtzee/:gameId',
      Sorry: 'sorry/:gameId',
      Backgammon: 'backgammon/:gameId',
      Checkers: 'checkers/:gameId',
      ChineseCheckers: 'chinese-checkers/:gameId',
      Klondike: 'klondike/:gameId',
      Pyramid: 'pyramid/:gameId',
      Spider: 'spider/:gameId',
      Settings: 'settings',
    },
  },
};

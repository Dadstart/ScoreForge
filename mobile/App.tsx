import { useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { linking } from './src/navigation/linking';
import type { RootStackParamList } from './src/navigation/types';
import { BoardScreen } from './src/screens/BoardScreen';
import { CribbageScreen } from './src/screens/CribbageScreen';
import { OpolyScreen } from './src/screens/OpolyScreen';
import { YahtScreen } from './src/screens/YahtScreen';
import { SorryScreen } from './src/screens/SorryScreen';
import { BackgammonScreen } from './src/screens/BackgammonScreen';
import { CheckersScreen } from './src/screens/CheckersScreen';
import { ChessScreen } from './src/screens/ChessScreen';
import { CanastaScreen } from './src/screens/CanastaScreen';
import { UneauxScreen } from './src/screens/UneauxScreen';
import { SkipBeauxScreen } from './src/screens/SkipBeauxScreen';
import { ReversiScreen } from './src/screens/ReversiScreen';
import { ChineseCheckersScreen } from './src/screens/ChineseCheckersScreen';
import { KlondikeScreen } from './src/screens/KlondikeScreen';
import { FreecellScreen } from './src/screens/FreecellScreen';
import { PyramidScreen } from './src/screens/PyramidScreen';
import { TriPeaksScreen } from './src/screens/TriPeaksScreen';
import { SpiderScreen } from './src/screens/SpiderScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { JoinScreen } from './src/screens/JoinScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { colors, fonts } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function useWebFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'scoreforge-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap';
    document.head.appendChild(link);
  }, []);
}

function useUnselectableText() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'scoreforge-unselectable';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      html, body, #root {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text;
        user-select: text;
        -webkit-touch-callout: default;
      }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function App() {
  useWebFonts();
  useUnselectableText();

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme} linking={linking}>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTintColor: colors.accent,
            headerTitleStyle: {
              fontFamily: fonts.display,
              fontWeight: '700',
              color: colors.text,
            },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'ScoreForge', headerShown: false }}
          />
          <Stack.Screen name="Setup" component={SetupScreen} options={{ title: 'New Game' }} />
          <Stack.Screen name="Join" component={JoinScreen} options={{ title: 'Join Game' }} />
          <Stack.Screen name="Board" component={BoardScreen} options={{ title: 'Scoreboard' }} />
          <Stack.Screen
            name="Cribbage"
            component={CribbageScreen}
            options={{ title: 'Cribbage', headerShown: false }}
          />
          <Stack.Screen
            name="Opoly"
            component={OpolyScreen}
            options={{ title: 'Opoly', headerShown: false }}
          />
          <Stack.Screen
            name="Yaht"
            component={YahtScreen}
            options={{ title: 'Yaht', headerShown: false }}
          />
          <Stack.Screen
            name="Sorry"
            component={SorryScreen}
            options={{ title: 'Sorry', headerShown: false }}
          />
          <Stack.Screen
            name="Backgammon"
            component={BackgammonScreen}
            options={{ title: 'Backgammon', headerShown: false }}
          />
          <Stack.Screen
            name="Checkers"
            component={CheckersScreen}
            options={{ title: 'Checkers', headerShown: false }}
          />
          <Stack.Screen
            name="Chess"
            component={ChessScreen}
            options={{ title: 'Chess', headerShown: false }}
          />
          <Stack.Screen
            name="Canasta"
            component={CanastaScreen}
            options={{ title: 'Canasta', headerShown: false }}
          />
          <Stack.Screen
            name="Uneaux"
            component={UneauxScreen}
            options={{ title: 'Uneaux', headerShown: false }}
          />
          <Stack.Screen
            name="SkipBeaux"
            component={SkipBeauxScreen}
            options={{ title: 'Skip-Beaux', headerShown: false }}
          />
          <Stack.Screen
            name="Reversi"
            component={ReversiScreen}
            options={{ title: 'Reversi', headerShown: false }}
          />
          <Stack.Screen
            name="ChineseCheckers"
            component={ChineseCheckersScreen}
            options={{ title: 'Chinese Checkers', headerShown: false }}
          />
          <Stack.Screen
            name="Klondike"
            component={KlondikeScreen}
            options={{ title: 'Klondike', headerShown: false }}
          />
          <Stack.Screen
            name="Freecell"
            component={FreecellScreen}
            options={{ title: 'FreeCell', headerShown: false }}
          />
          <Stack.Screen
            name="Pyramid"
            component={PyramidScreen}
            options={{ title: 'Pyramid', headerShown: false }}
          />
          <Stack.Screen
            name="TriPeaks"
            component={TriPeaksScreen}
            options={{ title: 'TriPeaks', headerShown: false }}
          />
          <Stack.Screen
            name="Spider"
            component={SpiderScreen}
            options={{ title: 'Spider', headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

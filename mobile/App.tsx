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
import { HomeScreen } from './src/screens/HomeScreen';
import { JoinScreen } from './src/screens/JoinScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
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

export default function App() {
  useWebFonts();

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
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

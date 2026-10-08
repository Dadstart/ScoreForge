import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Nav } from '../navigation/types';
import { colors, fonts } from '../theme';
import { createFireworkShow, type FireworkScene, type FireworkShow } from './fireworksShow';

type Props = {
  winnerName: string | null;
  /** Shown under the winner line (template or game name). */
  subtitle?: string;
  onDismiss: () => void;
};

export function FireworksOverlay({ winnerName, subtitle = 'ScoreForge', onDismiss }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const entrance = useRef(new Animated.Value(0)).current;
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const leftHome = useRef(false);

  const goHome = useCallback(() => {
    if (leftHome.current) return;
    leftHome.current = true;
    onDismiss();
    navigation.navigate('Home');
  }, [navigation, onDismiss]);

  useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [entrance]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      goHome();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goHome]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const titleLift = entrance.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={goHome}>
      <View style={styles.overlay} onLayout={onLayout}>
        {size.width > 0 && size.height > 0 ? <FireworkField width={size.width} height={size.height} /> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          onPress={goHome}
          style={[styles.close, { top: insets.top + 12, right: Math.max(12, insets.right + 12) }]}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6 18 18M18 6 6 18" stroke={colors.text} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </Pressable>

        <Animated.View style={[styles.center, { opacity: entrance, transform: [{ translateY: titleLift }] }]}>
          <Text style={styles.winner}>{winnerName ? `${winnerName} wins!` : 'Winner!'}</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </Animated.View>

        <Animated.View
          pointerEvents="box-none"
          style={[styles.buttonBar, { opacity: entrance, bottom: Math.max(24, insets.bottom + 16) }]}
        >
          <Pressable style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function FireworkField({ width, height }: { width: number; height: number }) {
  const showRef = useRef<FireworkShow | null>(null);
  if (showRef.current == null) showRef.current = createFireworkShow(width, height);
  const show = showRef.current;
  const [scene, setScene] = useState<FireworkScene>(() => show.step(1 / 60));

  useEffect(() => {
    show.resize(width, height);
  }, [show, width, height]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setScene(show.step(dt));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [show]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        {scene.stars.map((star, index) => (
          <Circle
            key={`star-${index}`}
            cx={star.x}
            cy={star.y}
            r={star.r}
            fill={star.gold ? colors.accent : '#f3f6f4'}
            opacity={star.opacity}
          />
        ))}
        {scene.flashes.map((flash) => (
          <Circle
            key={`ring-${flash.id}`}
            cx={flash.x}
            cy={flash.y}
            r={Math.max(1, flash.ringRadius)}
            stroke={flash.color}
            strokeWidth={1.4}
            fill="none"
            opacity={flash.ringOpacity}
          />
        ))}
        {scene.streaks.map((streak) => (
          <Path
            key={streak.key}
            d={streak.d}
            stroke={streak.color}
            strokeWidth={streak.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={streak.opacity}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 8, 6, 0.84)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  close: {
    position: 'absolute',
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 8, 6, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(243, 246, 244, 0.4)',
  },
  center: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  winner: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  sub: {
    fontFamily: fonts.body,
    color: colors.accent,
    fontSize: 18,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  buttonBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  btnText: { fontFamily: fonts.body, color: colors.accentText, fontWeight: '700', fontSize: 16 },
});

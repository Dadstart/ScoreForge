import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import type { Spark, SparkTone } from '../hooks/usePlaySpark';
import { fonts } from '../theme';

type Particle = {
  dx: number;
  dy: number;
  size: number;
  color: string;
};

const PALETTES: Record<SparkTone, string[]> = {
  gold: ['#ffd740', '#ffab40', '#fff6c8', '#ffe082', '#ffffff'],
  green: ['#69f0ae', '#b9f6ca', '#ffd740', '#e8fff2', '#ffffff'],
  rose: ['#ff8a80', '#ffd740', '#ff5252', '#ffe0dc', '#ffffff'],
};

const LABEL_COLOR: Record<SparkTone, string> = {
  gold: '#fff6d4',
  green: '#e7fff1',
  rose: '#ffe8e4',
};

type Props = {
  sparks: Spark[];
};

export function PlaySpark({ sparks }: Props) {
  if (sparks.length === 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.host}
    >
      {sparks.map((item) => (
        <Burst key={item.id} spark={item} drift={((item.id % 5) - 2) * 22} />
      ))}
    </View>
  );
}

function Burst({ spark, drift }: { spark: Spark; drift: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const particles = useRef(makeParticles(spark.tone)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 980,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [progress]);

  const ringScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1.7] });
  const ringOpacity = progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.85, 0.4, 0] });
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 1, 0] });
  const labelScale = progress.interpolate({ inputRange: [0, 0.16, 0.3, 1], outputRange: [0.35, 1.28, 1, 0.9] });
  const labelY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, -42] });

  return (
    <View style={[styles.burst, { marginLeft: drift }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: PALETTES[spark.tone][0],
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      {particles.map((particle, index) => (
        <ParticleDot key={index} progress={progress} particle={particle} />
      ))}
      <Animated.Text
        style={[
          styles.label,
          {
            color: LABEL_COLOR[spark.tone],
            opacity: labelOpacity,
            transform: [{ translateY: labelY }, { scale: labelScale }],
          },
        ]}
      >
        {spark.label}
      </Animated.Text>
    </View>
  );
}

function ParticleDot({ progress, particle }: { progress: Animated.Value; particle: Particle }) {
  const opacity = progress.interpolate({ inputRange: [0, 0.08, 0.55, 1], outputRange: [0, 1, 0.9, 0] });
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.dx] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.dy] });
  const scale = progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.2, 1, 0.25] });
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
          backgroundColor: particle.color,
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  );
}

function makeParticles(tone: SparkTone): Particle[] {
  const palette = PALETTES[tone];
  return Array.from({ length: 18 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 18 + (Math.random() - 0.5) * 0.45;
    const dist = 46 + Math.random() * 62;
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.72 - 8,
      size: 3 + Math.random() * 4.5,
      color: palette[index % palette.length],
    };
  });
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    pointerEvents: 'none',
    alignItems: 'center',
    overflow: 'visible',
  },
  burst: {
    position: 'absolute',
    top: '22%',
    width: 280,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
  },
  dot: {
    position: 'absolute',
  },
  label: {
    fontFamily: fonts.display,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});

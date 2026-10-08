import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { cellBox, spaceToCell } from '../domain/monopolyBoard';
import { diceMotionMs } from './MonopolyDice';
import { fonts } from '../theme';

export type MoneyFlight = {
  id: number;
  playerId: string;
  space: number;
  /** Set when the token is still walking to this square. Bills wait until it arrives. */
  routeId: number | null;
};

type Burst = { id: number; space: number };

const COUNT = 5;

export function MoneyBills({ flight, boardSize }: { flight: Burst | null; boardSize: number }) {
  if (!flight || boardSize <= 0 || diceMotionMs() === 0) return null;
  return <BillBurst key={flight.id} space={flight.space} boardSize={boardSize} />;
}

function BillBurst({ space, boardSize }: { space: number; boardSize: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const bills = useRef(fan(space, boardSize)).current;
  const { row, col } = spaceToCell(space);
  const frame = cellBox(row, col);
  const width = Math.max(28, Math.round(boardSize * 0.028));
  const height = Math.max(16, Math.round(width * 0.52));

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 980,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.layer,
        {
          left: (frame.x + frame.w / 2) * boardSize,
          top: (frame.y + frame.h / 2) * boardSize,
        },
      ]}
    >
      {bills.map((bill, index) => (
        <Bill key={index} progress={progress} bill={bill} index={index} width={width} height={height} />
      ))}
    </View>
  );
}

function Bill({
  progress,
  bill,
  index,
  width,
  height,
}: {
  progress: Animated.Value;
  bill: { dx: number; dy: number; spin: number };
  index: number;
  width: number;
  height: number;
}) {
  const start = 0.02 + index * 0.07;
  const shown = start + 0.1;
  const opacity = progress.interpolate({
    inputRange: [0, start, shown, 0.78, 1],
    outputRange: [0, 0, 1, 1, 0],
  });
  const translateX = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, bill.dx] });
  const translateY = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, bill.dy] });
  const rotate = progress.interpolate({
    inputRange: [0, start, 1],
    outputRange: ['0deg', '0deg', `${bill.spin}deg`],
  });
  const scale = progress.interpolate({ inputRange: [0, start, shown, 1], outputRange: [0.35, 0.35, 1, 0.86] });
  return (
    <Animated.View
      testID="dollar-bill"
      style={[
        styles.bill,
        {
          width,
          height,
          marginLeft: -width / 2,
          marginTop: -height / 2,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }, { scale }],
        },
      ]}
    >
      <View style={[styles.seal, { width: height * 0.62, height: height * 0.62, borderRadius: height }]} />
      <Text style={[styles.mark, { fontSize: Math.round(height * 0.62) }]}>$</Text>
    </Animated.View>
  );
}

function fan(space: number, boardSize: number) {
  const { row, col } = spaceToCell(space);
  const dir = row === 10 ? { x: 0, y: -1 } : row === 0 ? { x: 0, y: 1 } : col === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const base = Math.atan2(dir.y, dir.x);
  const distance = Math.max(96, boardSize * 0.2);
  return Array.from({ length: COUNT }, (_, index) => {
    const angle = base + (index - (COUNT - 1) / 2) * 0.4;
    const dist = distance * (0.78 + (index % 3) * 0.16);
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      spin: (index - 2) * 36,
    };
  });
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    width: 0,
    height: 0,
    zIndex: 34,
    overflow: 'visible',
  },
  bill: {
    position: 'absolute',
    borderRadius: 3,
    backgroundColor: '#3aaa55',
    borderWidth: 1.5,
    borderColor: '#176b32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seal: {
    position: 'absolute',
    backgroundColor: '#8fd98a',
    opacity: 0.9,
  },
  mark: {
    fontFamily: fonts.display,
    color: '#f4fff4',
    fontWeight: '800',
    textShadowColor: 'rgba(12, 60, 24, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { cellBox, spaceToCell } from '../domain/opolyBoard';
import { formatMoney } from '../domain/opoly';
import { diceMotionMs } from './OpolyDice';
import { colors, fonts } from '../theme';

export type MoneyFlow = 'pay' | 'receive';

export type MoneyFlight = {
  id: number;
  playerId: string;
  space: number;
  /** Set when the token is still walking. Bills wait until it arrives. */
  routeId: number | null;
  flow: MoneyFlow;
  amount: number;
};

/** More bills for a larger payment or collection. */
export function cashBillCount(amount: number): number {
  const abs = Math.abs(amount);
  if (abs >= 500) return 16;
  if (abs >= 200) return 12;
  if (abs >= 100) return 9;
  if (abs >= 50) return 7;
  return 6;
}

export function MoneyBills({ flights, boardSize }: { flights: MoneyFlight[]; boardSize: number }) {
  if (boardSize <= 0 || flights.length === 0 || diceMotionMs() === 0) return null;
  return (
    <>
      {flights.map((flight) => (
        <BillBurst
          key={flight.id}
          space={flight.space}
          amount={flight.amount}
          flow={flight.flow}
          boardSize={boardSize}
        />
      ))}
    </>
  );
}

function BillBurst({
  space,
  amount,
  flow,
  boardSize,
}: {
  space: number;
  amount: number;
  flow: MoneyFlow;
  boardSize: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const bills = useRef(fan(space, boardSize, amount)).current;
  const { row, col } = spaceToCell(space);
  const frame = cellBox(row, col);
  const width = Math.max(30, Math.round(boardSize * (amount >= 200 ? 0.038 : 0.032)));
  const height = Math.max(16, Math.round(width * 0.52));

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 980 + bills.length * 35,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [bills.length, progress]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.layer,
        {
          left: (frame.x + frame.w / 2) * boardSize,
          top: (frame.y + frame.h / 2) * boardSize,
        },
        { pointerEvents: 'none' },
      ]}
    >
      {bills.map((bill, index) => (
        <Bill
          key={index}
          progress={progress}
          bill={bill}
          index={index}
          count={bills.length}
          flow={flow}
          width={width}
          height={height}
        />
      ))}
    </View>
  );
}

function Bill({
  progress,
  bill,
  index,
  count,
  flow,
  width,
  height,
}: {
  progress: Animated.Value;
  bill: { dx: number; dy: number; spin: number };
  index: number;
  count: number;
  flow: MoneyFlow;
  width: number;
  height: number;
}) {
  const start = Math.min(0.45, 0.03 + index * (0.42 / count));
  const shown = start + 0.08;
  const opacity = progress.interpolate({
    inputRange: [0, start, shown, 0.8, 1],
    outputRange: [0, 0, 1, 1, 0],
  });
  const fromX = flow === 'receive' ? bill.dx : 0;
  const toX = flow === 'receive' ? 0 : bill.dx;
  const fromY = flow === 'receive' ? bill.dy : 0;
  const toY = flow === 'receive' ? 0 : bill.dy;
  const translateX = progress.interpolate({ inputRange: [0, start, 1], outputRange: [fromX, fromX, toX] });
  const translateY = progress.interpolate({ inputRange: [0, start, 1], outputRange: [fromY, fromY, toY] });
  const rotate = progress.interpolate({
    inputRange: [0, start, 1],
    outputRange: ['0deg', '0deg', `${bill.spin}deg`],
  });
  const scale = progress.interpolate({
    inputRange: [0, start, shown, 1],
    outputRange: flow === 'receive' ? [0.7, 0.7, 1.05, 0.92] : [0.35, 0.35, 1.08, 0.84],
  });
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

export function CashAmount({
  label,
  broke,
  pulse,
  style,
}: {
  label: string;
  broke?: boolean;
  pulse?: { id: number; delta: number } | null;
  style?: StyleProp<TextStyle>;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const pulseId = pulse?.id ?? null;
  const delta = pulse?.delta ?? 0;

  useEffect(() => {
    if (pulseId == null || diceMotionMs() === 0) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.86);
    const animation = Animated.sequence([
      Animated.timing(scale, {
        toValue: delta > 0 ? 1.22 : 0.9,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 4,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delta, pulseId, scale]);

  return (
    <View style={styles.cashSlot}>
      <Animated.Text style={[style, broke && { color: colors.danger }, { transform: [{ scale }] }]}>
        {label}
      </Animated.Text>
      {pulse && diceMotionMs() !== 0 ? <CashBurst key={pulse.id} delta={pulse.delta} /> : null}
    </View>
  );
}

function CashBurst({ delta }: { delta: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const receive = delta > 0;
  const bills = useRef(cardFan(delta, receive)).current;
  const label = receive ? `+${formatMoney(delta)}` : formatMoney(delta);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 1100 + bills.length * 20,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [bills.length, progress]);

  const labelOpacity = progress.interpolate({
    inputRange: [0, 0.08, 0.72, 1],
    outputRange: [0, 1, 1, 0],
  });
  const labelY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: receive ? [10, -46] : [0, -28],
  });
  const labelScale = progress.interpolate({
    inputRange: [0, 0.16, 1],
    outputRange: [0.7, 1.15, 1],
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.cashBurst, { pointerEvents: 'none' }]}
    >
      {bills.map((bill, index) => (
        <CardBill key={index} progress={progress} bill={bill} index={index} count={bills.length} receive={receive} />
      ))}
      <Animated.Text
        style={[
          styles.cashLabel,
          { color: receive ? colors.success : colors.danger },
          { opacity: labelOpacity, transform: [{ translateY: labelY }, { scale: labelScale }] },
        ]}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

function CardBill({
  progress,
  bill,
  index,
  count,
  receive,
}: {
  progress: Animated.Value;
  bill: { dx: number; dy: number; spin: number };
  index: number;
  count: number;
  receive: boolean;
}) {
  const start = Math.min(0.4, 0.02 + index * (0.36 / count));
  const shown = start + 0.1;
  const opacity = progress.interpolate({
    inputRange: [0, start, shown, 0.78, 1],
    outputRange: [0, 0, 1, 1, 0],
  });
  const fromY = receive ? 8 : 0;
  const translateX = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, bill.dx] });
  const translateY = progress.interpolate({ inputRange: [0, start, 1], outputRange: [fromY, fromY, bill.dy] });
  const rotate = progress.interpolate({
    inputRange: [0, start, 1],
    outputRange: ['0deg', '0deg', `${bill.spin}deg`],
  });
  const scale = progress.interpolate({
    inputRange: [0, start, shown, 1],
    outputRange: [0.4, 0.4, 1, 0.85],
  });
  return (
    <Animated.View
      style={[
        styles.bill,
        styles.cardBill,
        {
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }, { scale }],
        },
      ]}
    >
      <Text style={styles.cardMark}>$</Text>
    </Animated.View>
  );
}

function fan(space: number, boardSize: number, amount: number) {
  const { row, col } = spaceToCell(space);
  const dir = row === 10 ? { x: 0, y: -1 } : row === 0 ? { x: 0, y: 1 } : col === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const base = Math.atan2(dir.y, dir.x);
  const count = cashBillCount(amount);
  const distance = Math.max(110, boardSize * (0.24 + Math.min(Math.abs(amount), 500) / 2500));
  const step = Math.min(0.46, 2.2 / count);
  return Array.from({ length: count }, (_, index) => {
    const angle = base + (index - (count - 1) / 2) * step;
    const dist = distance * (0.72 + (index % 4) * 0.14);
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist,
      spin: (index - (count - 1) / 2) * 28,
    };
  });
}

function cardFan(amount: number, receive: boolean) {
  const count = cashBillCount(amount);
  return Array.from({ length: count }, (_, index) => {
    const spread = (index - (count - 1) / 2) * (receive ? 16 : 14);
    const lift = 34 + (index % 5) * 14;
    return {
      dx: spread,
      dy: receive ? -lift : lift + 18,
      spin: (index - count / 2) * 22,
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
    ...Platform.select({
      web: { textShadow: '0px 1px 1px rgba(12, 60, 24, 0.45)' },
      default: {
        textShadowColor: 'rgba(12, 60, 24, 0.45)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
      },
    }),
  },
  cashSlot: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    overflow: 'visible',
  },
  cashBurst: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 4,
  },
  cardBill: {
    width: 28,
    height: 16,
    marginLeft: -14,
    marginTop: -8,
  },
  cardMark: {
    fontFamily: fonts.display,
    color: '#f4fff4',
    fontSize: 11,
    fontWeight: '800',
  },
  cashLabel: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
});

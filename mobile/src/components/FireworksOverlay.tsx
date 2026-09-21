import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

type Props = {
  winnerName: string | null;
  onDismiss: () => void;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
};

type Rocket = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  burstAtY: number;
  life: number;
  color: string;
};

const PALETTE = ['#ffd740', '#ff5252', '#448aff', '#69f0ae', '#e040fb', '#ffab40', '#ffffff'];

export function FireworksOverlay({ winnerName, onDismiss }: Props) {
  const [size, setSize] = useState({ width: 300, height: 500 });
  const [frame, setFrame] = useState(0);
  const particles = useRef<Particle[]>([]);
  const rockets = useRef<Rocket[]>([]);
  const elapsed = useRef(0);
  const nextLaunch = useRef(0);
  const random = useRef(Math.random);

  const burst = (x: number, y: number, color: string) => {
    const count = 28 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      particles.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.7 + Math.random() * 1.1,
        maxLife: 1.8,
        radius: 1.6 + Math.random() * 2.4,
        color: Math.random() < 0.25 ? PALETTE[Math.floor(Math.random() * PALETTE.length)] : color,
      });
    }
  };

  const launch = (immediate: boolean) => {
    const { width, height } = size;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const x = width * (0.15 + Math.random() * 0.7);
    const burstY = height * (0.18 + Math.random() * 0.35);
    if (immediate) {
      burst(x, burstY, color);
      return;
    }
    const startY = height + 10;
    rockets.current.push({
      x,
      y: startY,
      vx: (Math.random() - 0.5) * 40,
      vy: -Math.sqrt(2 * 180 * (startY - burstY)) * (0.85 + Math.random() * 0.25),
      burstAtY: burstY,
      life: 2.5,
      color,
    });
  };

  useEffect(() => {
    particles.current = [];
    rockets.current = [];
    elapsed.current = 0;
    nextLaunch.current = 0;
    for (let i = 0; i < 3; i++) launch(true);

    const id = setInterval(() => {
      const dt = 0.016;
      elapsed.current += dt;
      const { width, height } = size;

      if (elapsed.current < 5.5 && elapsed.current >= nextLaunch.current) {
        launch(false);
        nextLaunch.current = elapsed.current + 0.18 + Math.random() * 0.24;
      }

      rockets.current = rockets.current.flatMap((rocket) => {
        const next = {
          ...rocket,
          vy: rocket.vy + 18 * dt,
          x: rocket.x + rocket.vx * dt,
          y: rocket.y + rocket.vy * dt,
          life: rocket.life - dt,
        };
        if (next.y <= next.burstAtY || next.life <= 0 || next.vy > 40) {
          burst(next.x, next.y, next.color);
          return [];
        }
        return [next];
      });

      particles.current = particles.current
        .map((p) => ({
          ...p,
          vy: p.vy + 120 * dt,
          vx: p.vx * 0.985,
          x: p.x + p.vx * dt,
          y: p.y + p.vy * dt,
          life: p.life - dt,
          radius: p.radius * 0.995,
        }))
        .filter((p) => p.life > 0 && p.y < height + 20);

      void width;
      setFrame((f) => f + 1);
    }, 16);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  };

  return (
    <View style={styles.overlay} onLayout={onLayout}>
      <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
        {rockets.current.map((r, i) => (
          <Line
            key={`r-${frame}-${i}`}
            x1={r.x}
            y1={r.y}
            x2={r.x - r.vx * 0.04}
            y2={r.y - r.vy * 0.04}
            stroke={r.color}
            strokeWidth={2}
            opacity={0.7}
          />
        ))}
        {particles.current.map((p, i) => (
          <Circle
            key={`p-${frame}-${i}`}
            cx={p.x}
            cy={p.y}
            r={p.radius}
            fill={p.color}
            opacity={Math.max(0, p.life / p.maxLife)}
          />
        ))}
      </Svg>

      <View style={styles.center}>
        <Text style={styles.winner}>{winnerName ? `${winnerName} wins!` : 'Winner!'}</Text>
        <Text style={styles.sub}>Cribbage</Text>
      </View>

      <Pressable style={styles.btn} onPress={onDismiss}>
        <Text style={styles.btnText}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,6,18,0.72)',
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { alignItems: 'center', gap: 6 },
  winner: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  sub: { color: '#ffd740', fontSize: 18, fontWeight: '600' },
  btn: {
    position: 'absolute',
    bottom: 36,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

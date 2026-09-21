import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme';

export type CribbagePegPlayer = {
  id: string;
  name: string;
  total: number;
  frontPeg: number;
  rearPeg: number;
  color: string;
  isWinner: boolean;
  isSelected: boolean;
};

type Props = {
  players: CribbagePegPlayer[];
  targetScore: number;
};

const TRACK_LENGTH = 120;
const STREETS = 4;
const HOLES_PER_STREET = 30;

export function CribbageBoard({ players, targetScore }: Props) {
  const [size, setSize] = useState({ width: 320, height: 280 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ width, height });
  };

  const tracks = useMemo(() => {
    const padding = 16;
    const header = 28;
    const usableW = size.width - padding * 2;
    const usableH = Math.max(size.height - padding * 2 - header, 80);
    const trackGap = 12;
    const trackH =
      (usableH - trackGap * Math.max(players.length - 1, 0)) / Math.max(players.length, 1);

    return players.map((player, t) => {
      const top = padding + header + t * (trackH + trackGap);
      const streetGap = 5;
      const streetH = (trackH - streetGap * (STREETS - 1)) / STREETS;
      const holeR = Math.min(streetH * 0.28, usableW / (HOLES_PER_STREET * 2.4));

      const holeCenter = (holeNumber: number) => {
        if (holeNumber <= 0) {
          return { x: padding + holeR * 1.2, y: top + streetH * 0.5 };
        }
        if (holeNumber > TRACK_LENGTH) {
          return {
            x: padding + usableW - holeR * 1.2,
            y: top + (STREETS - 1) * (streetH + streetGap) + streetH * 0.5,
          };
        }
        const index = holeNumber - 1;
        const street = Math.floor(index / HOLES_PER_STREET);
        const posInStreet = index % HOLES_PER_STREET;
        const goingRight = street % 2 === 0;
        const col = goingRight ? posInStreet : HOLES_PER_STREET - 1 - posInStreet;
        const y = top + street * (streetH + streetGap) + streetH * 0.5;
        const usableTrackW = usableW - holeR * 4;
        const x = padding + holeR * 2 + (col + 0.5) * (usableTrackW / HOLES_PER_STREET);
        return { x, y };
      };

      return {
        player,
        top,
        holeR,
        holes: Array.from({ length: TRACK_LENGTH }, (_, i) => holeCenter(i + 1)),
        finish: holeCenter(TRACK_LENGTH + 1),
        rear: holeCenter(player.rearPeg),
        front: holeCenter(player.frontPeg),
      };
    });
  }, [players, size]);

  return (
    <View style={styles.board} onLayout={onLayout}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`}>
        <Rect x={0} y={0} width={size.width} height={size.height} rx={12} fill={colors.woodDark} />
        <Rect
          x={6}
          y={6}
          width={size.width - 12}
          height={size.height - 12}
          rx={10}
          fill={colors.wood}
        />
        <SvgText x={18} y={24} fill="#e6d6b4" fontSize="11">
          START
        </SvgText>
        <SvgText x={size.width - 90} y={24} fill="#e6d6b4" fontSize="11">
          {`FINISH ${targetScore}`}
        </SvgText>

        {tracks.map(({ player, top, holeR, holes, finish, rear, front }) => (
          <G key={player.id}>
            <SvgText
              x={18}
              y={top - 6}
              fill={player.isSelected ? '#fff' : '#e6d6b4'}
              fontSize="13"
              fontWeight="700"
            >
              {player.isWinner
                ? `${player.name} — winner`
                : `${player.name}  ${player.total}`}
            </SvgText>
            {holes.map((h, i) => (
              <Circle key={`${player.id}-h-${i}`} cx={h.x} cy={h.y} r={holeR} fill={colors.hole} />
            ))}
            <Circle
              cx={finish.x}
              cy={finish.y}
              r={holeR * 1.15}
              fill="#c8aa5a"
              stroke="#e6d6b4"
              strokeWidth={1.5}
            />
            <Circle cx={rear.x} cy={rear.y} r={holeR * 1.35} fill={player.color} opacity={0.55} />
            <Circle
              cx={front.x}
              cy={front.y}
              r={holeR * 1.35}
              fill={player.color}
              stroke="#140c08"
              strokeWidth={1.5}
            />
          </G>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    flex: 1,
    minHeight: 200,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

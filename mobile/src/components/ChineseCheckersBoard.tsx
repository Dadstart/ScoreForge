import Svg, { Circle, G, Polygon } from 'react-native-svg';
import { View } from 'react-native';
import {
  BOARD,
  CORNERS,
  STAR_OUTLINE,
  campAt,
  cellPixel,
  opposite,
  rotateCell,
  type ChineseHop,
  type ChinesePiece,
  type Corner,
} from '../domain/chineseCheckers';
import { colors } from '../theme';

type Cell = { q: number; r: number };

type Props = {
  pieces: readonly ChinesePiece[];
  hops: readonly ChineseHop[];
  selected: Cell | null;
  lastMove: ChineseHop | null;
  /** Starts and goals that should pick up their color. */
  camps: readonly Corner[];
  /** Camps the player to move is trying to fill. */
  goals: readonly Corner[];
  fifteen: boolean;
  rotation: number;
  disabled?: boolean;
  onCell: (q: number, r: number) => void;
};

const VIEW = { x: -7.3, y: -8.3, width: 14.6, height: 16.6 };

export function ChineseCheckersBoard({
  pieces,
  hops,
  selected,
  lastMove,
  camps,
  goals,
  fifteen,
  rotation,
  disabled,
  onCell,
}: Props) {
  const campSet = new Set(camps);
  const goalSet = new Set(goals);
  const selectedHops = selected
    ? hops.filter((hop) => hop.fromQ === selected.q && hop.fromR === selected.r)
    : [];
  const outline = STAR_OUTLINE.map((cell) => {
    const point = pixel(cell.q, cell.r, rotation);
    return `${point.x * 1.16},${point.y * 1.16}`;
  }).join(' ');

  return (
    <View style={{ width: '100%', aspectRatio: VIEW.width / VIEW.height }}>
      <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}>
        <Polygon points={outline} fill={colors.woodDark} stroke={colors.wood} strokeWidth={0.12} />
        {BOARD.map((cell) => {
          const point = pixel(cell.q, cell.r, rotation);
          const camp = campAt(cell.q, cell.r, fifteen);
          const colored = camp != null && campSet.has(camp);
          const goal = colored && goalSet.has(camp);
          const hop = selectedHops.find((item) => item.toQ === cell.q && item.toR === cell.r) ?? null;
          const landed =
            (lastMove?.toQ === cell.q && lastMove.toR === cell.r) ||
            (lastMove?.fromQ === cell.q && lastMove.fromR === cell.r);
          const selectedHere = selected?.q === cell.q && selected?.r === cell.r;
          const movable = hops.some((item) => item.fromQ === cell.q && item.fromR === cell.r);
          const piece = pieces.find((item) => item.q === cell.q && item.r === cell.r) ?? null;
          const side = piece ? CORNERS[piece.corner] : null;
          const campColor = camp == null ? null : CORNERS[camp].fill;
          const label = piece
            ? `${side?.name}${selectedHere ? ', selected' : ''}`
            : hop
              ? hop.jump
                ? 'Jump here'
                : 'Step here'
              : 'Empty hole';

          return (
            <G
              key={`${cell.q},${cell.r}`}
              onPress={disabled ? undefined : () => onCell(cell.q, cell.r)}
              accessibilityLabel={label}
            >
              <Circle
                cx={point.x}
                cy={point.y}
                r={0.4}
                fill={colored && campColor ? mix(campColor, goal ? 0.55 : 0.28) : colors.hole}
                stroke={landed ? colors.accent : colors.wood}
                strokeWidth={landed ? 0.06 : 0.03}
              />
              {hop ? (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={hop.jump ? 0.16 : 0.11}
                  fill={hop.jump ? '#f3d78a' : colors.accent}
                />
              ) : null}
              {piece && side ? (
                <G>
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={0.3}
                    fill={side.fill}
                    stroke={selectedHere ? '#f6e7a8' : movable ? colors.accent : side.rim}
                    strokeWidth={selectedHere ? 0.07 : 0.035}
                  />
                  <Circle cx={point.x - 0.08} cy={point.y - 0.1} r={0.08} fill="rgba(255,255,255,0.45)" />
                </G>
              ) : null}
              <Circle cx={point.x} cy={point.y} r={0.46} fill="transparent" />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

export function goalCorners(corners: readonly Corner[]): Corner[] {
  return corners.map((corner) => opposite(corner));
}

function pixel(q: number, r: number, rotation: number): { x: number; y: number } {
  const cell = rotateCell(q, r, rotation);
  return cellPixel(cell.q, cell.r);
}

function mix(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channel = (index: number) => parseInt(value.slice(index, index + 2), 16);
  const blend = (part: number) => Math.round(28 + (part - 28) * amount);
  return `rgb(${blend(channel(0))}, ${blend(channel(2))}, ${blend(channel(4))})`;
}

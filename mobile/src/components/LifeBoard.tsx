import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { Player } from '../domain/models';
import {
  COLLEGE,
  COUNTRY,
  ESTATE,
  LIFE_COLORS,
  TRACK,
  colorIndexFor,
  type LifeState,
  type SpaceKind,
  type TrackSpace,
} from '../domain/life';
import {
  CAREER_GATE,
  ROAD_WIDTH,
  SPINNER,
  START,
  VIEW,
  markerPoint,
  pathRibbon,
  tilesFor,
  type Point,
  type Tile,
} from '../domain/lifeBoard';

type Props = {
  players: Player[];
  state: LifeState;
};

const WHEEL = ['#e23d3d', '#f08a24', '#f2c14e', '#d6d94a', '#7ac943', '#2f9e4f', '#2aa7a1', '#3d7edb', '#7b4bb8', '#d23b78'];

export function LifeBoard({ players, state }: Props) {
  const cars = placeCars(players, state);

  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
        <Rect x={0} y={0} width={VIEW.w} height={VIEW.h} rx={18} fill="#2f9a49" />
        <Rect x={10} y={10} width={VIEW.w - 20} height={VIEW.h - 20} rx={14} fill="#3caf58" />
        <Rect
          x={6}
          y={6}
          width={VIEW.w - 12}
          height={VIEW.h - 12}
          rx={16}
          fill="none"
          stroke="#2f6fbe"
          strokeWidth={7}
        />

        <Road path="college" />
        <Road path="track" />
        <Road path="country" />
        <Road path="estate" />

        {COLLEGE.map((space, index) => (
          <SpaceTile key={space.id} space={space} tile={tilesFor('college')[index]} />
        ))}
        {TRACK.map((space, index) => (
          <SpaceTile key={space.id} space={space} tile={tilesFor('track')[index]} />
        ))}
        {COUNTRY.map((space, index) => (
          <SpaceTile key={space.id} space={space} tile={tilesFor('country')[index]} />
        ))}
        {ESTATE.map((space, index) => (
          <SpaceTile key={space.id} space={space} tile={tilesFor('estate')[index]} />
        ))}

        <Sign x={START.x} y={START.y} title="START" detail="College or career" />
        <Sign x={CAREER_GATE.x} y={CAREER_GATE.y} title="CAREER" detail="Skip college" />
        <SvgText x={112} y={214} fontSize={8} fontWeight="700" fill="#e9ffe9" textAnchor="middle">
          COLLEGE
        </SvgText>
        <SvgText x={130} y={512} fontSize={7.5} fontWeight="700" fill="#e9ffe9" textAnchor="middle">
          COUNTRY
        </SvgText>
        <SvgText x={470} y={512} fontSize={7.5} fontWeight="700" fill="#fff4d2" textAnchor="middle">
          CITY
        </SvgText>

        <Spinner spin={state.spin} />

        {cars.map((car) => (
          <G key={car.key} transform={`translate(${car.point.x} ${car.point.y})`}>
            <Rect
              x={-8}
              y={-5}
              width={16}
              height={10}
              rx={3}
              fill={car.fill}
              stroke={car.current ? '#fffaf0' : '#1c140c'}
              strokeWidth={car.current ? 1.3 : 0.45}
            />
            <SvgText y={2.2} fontSize={5.4} fontWeight="700" textAnchor="middle" fill={car.ink}>
              {car.letter}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

function Road({ path }: { path: 'college' | 'track' | 'country' | 'estate' }) {
  const points = pathRibbon(path)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  return (
    <Polyline
      points={points}
      fill="none"
      stroke="#f4efe2"
      strokeWidth={ROAD_WIDTH + 8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

function SpaceTile({ space, tile }: { space: TrackSpace; tile: Tile }) {
  const tone = spaceTone(space.kind);
  return (
    <G>
      <Polygon
        points={tile.corners.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={tone.fill}
        stroke="#fffaf0"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
      <G transform={`translate(${tile.x} ${tile.y}) rotate(${tile.angle})`}>
        <SvgText y={-3.4} fontSize={7} fontWeight="700" textAnchor="middle" fill={tone.ink}>
          {space.lines[0]}
        </SvgText>
        <SvgText y={5.6} fontSize={5} fontWeight="600" textAnchor="middle" fill={tone.ink}>
          {space.lines[1]}
        </SvgText>
      </G>
    </G>
  );
}

function Sign({ x, y, title, detail }: { x: number; y: number; title: string; detail: string }) {
  return (
    <G transform={`translate(${x} ${y})`}>
      <Rect x={-28} y={-13} width={56} height={26} rx={4} fill="#f7f1df" stroke="#c4b08a" strokeWidth={0.8} />
      <SvgText y={-1} fontSize={6} fontWeight="700" textAnchor="middle" fill="#5c3a20">
        {title}
      </SvgText>
      <SvgText y={8} fontSize={3.6} fontWeight="600" textAnchor="middle" fill="#5c3a20">
        {detail}
      </SvgText>
    </G>
  );
}

function Spinner({ spin }: { spin: number | null }) {
  const { x, y, r } = SPINNER;
  return (
    <G>
      <Circle cx={x} cy={y} r={r + 8} fill="#1f7a3a" stroke="#f4efe2" strokeWidth={3} />
      {WHEEL.map((fill, index) => {
        const number = index + 1;
        const center = numberAngle(number);
        return (
          <Path
            key={number}
            d={wedge(x, y, r, center - 18, center + 18)}
            fill={fill}
            stroke="#fffaf0"
            strokeWidth={0.7}
          />
        );
      })}
      {WHEEL.map((_, index) => {
        const number = index + 1;
        const rad = (numberAngle(number) * Math.PI) / 180;
        const active = spin === number;
        return (
          <SvgText
            key={`n-${number}`}
            x={x + Math.cos(rad) * (r * 0.68)}
            y={y + Math.sin(rad) * (r * 0.68) + 2.4}
            fontSize={active ? 11 : 8}
            fontWeight="700"
            textAnchor="middle"
            fill={active ? '#1a1408' : '#1a1408'}
          >
            {number}
          </SvgText>
        );
      })}
      <Circle cx={x} cy={y} r={22} fill="#f7f1df" stroke="#e2b325" strokeWidth={2} />
      <SvgText x={x} y={y - 2} fontSize={6} fontWeight="700" textAnchor="middle" fill="#8a6420">
        SPIN
      </SvgText>
      <SvgText x={x} y={y + 10} fontSize={11} fontWeight="700" textAnchor="middle" fill="#2a2110">
        {spin ?? '·'}
      </SvgText>
      {spin ? <Pointer x={x} y={y} angle={numberAngle(spin)} radius={r + 2} /> : null}
    </G>
  );
}

function Pointer({ x, y, angle, radius }: { x: number; y: number; angle: number; radius: number }) {
  const rad = (angle * Math.PI) / 180;
  const tip = { x: x + Math.cos(rad) * (radius + 10), y: y + Math.sin(rad) * (radius + 10) };
  const left = {
    x: x + Math.cos(rad) * (radius - 8),
    y: y + Math.sin(rad) * (radius - 8),
  };
  const wing = 7;
  const normal = rad + Math.PI / 2;
  const a = {
    x: left.x + Math.cos(normal) * wing,
    y: left.y + Math.sin(normal) * wing,
  };
  const b = {
    x: left.x - Math.cos(normal) * wing,
    y: left.y - Math.sin(normal) * wing,
  };
  return <Polygon points={`${tip.x},${tip.y} ${a.x},${a.y} ${b.x},${b.y}`} fill="#fffaf0" stroke="#1a1408" strokeWidth={0.6} />;
}

function numberAngle(number: number): number {
  return -90 + (number - 1) * 36;
}

function wedge(cx: number, cy: number, radius: number, start: number, end: number): string {
  const a0 = (start * Math.PI) / 180;
  const a1 = (end * Math.PI) / 180;
  const x0 = cx + Math.cos(a0) * radius;
  const y0 = cy + Math.sin(a0) * radius;
  const x1 = cx + Math.cos(a1) * radius;
  const y1 = cy + Math.sin(a1) * radius;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1} Z`;
}

function placeCars(players: Player[], state: LifeState): Marker[] {
  const parked = players.map((player) => {
    const life = state.players[player.id];
    const color = LIFE_COLORS[colorIndexFor(state, player.id)];
    return {
      key: player.id,
      point: life ? markerPoint(life) : START,
      fill: color.fill,
      ink: color.ink,
      letter: player.name.trim().charAt(0).toUpperCase() || '?',
      current: player.id === state.currentPlayerId,
    };
  });
  const groups = new Map<string, Marker[]>();
  for (const marker of parked) {
    const key = `${Math.round(marker.point.x)}:${Math.round(marker.point.y)}`;
    const group = groups.get(key) ?? [];
    group.push(marker);
    groups.set(key, group);
  }
  const placed: Marker[] = [];
  for (const group of groups.values()) {
    group.forEach((marker, index) => {
      const shift = (index - (group.length - 1) / 2) * 12;
      placed.push({ ...marker, point: { x: marker.point.x + shift, y: marker.point.y } });
    });
  }
  return placed;
}

type Marker = {
  key: string;
  point: Point;
  fill: string;
  ink: string;
  letter: string;
  current: boolean;
};

function spaceTone(kind: SpaceKind): { fill: string; ink: string } {
  switch (kind) {
    case 'payday':
      return { fill: '#f08a24', ink: '#2a1604' };
    case 'life':
      return { fill: '#1f8f45', ink: '#f4fff6' };
    case 'baby':
      return { fill: '#3d7edb', ink: '#f4f8ff' };
    case 'taxes':
      return { fill: '#d64545', ink: '#fff6f4' };
    case 'wedding':
      return { fill: '#e2b325', ink: '#2a2110' };
    case 'house':
      return { fill: '#c46a2f', ink: '#fff8f2' };
    case 'career':
      return { fill: '#7b4bb8', ink: '#f8f4ff' };
    case 'graduate':
      return { fill: '#2457c5', ink: '#f4f7ff' };
    case 'study':
      return { fill: '#217ea0', ink: '#f3fbff' };
    case 'fork':
      return { fill: '#f0d36a', ink: '#2a2110' };
    case 'retire':
      return { fill: '#0f6b45', ink: '#f3fff8' };
  }
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: VIEW.w / VIEW.h },
});

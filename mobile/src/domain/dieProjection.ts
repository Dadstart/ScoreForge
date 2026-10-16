/** Board camera shared by the tilted board and the iPhone dice. */

const TILT = (50 * Math.PI) / 180;
const TILT_COS = Math.cos(TILT);
const TILT_SIN = Math.sin(TILT);

export function boardCamera(board: number) {
  const perspective = Math.max(900, board * 1.85);
  if (board <= 0) return { perspective, scale: 1 };
  const margin = 0.92;
  const scale = Math.min(1, (margin * perspective) / (perspective + (margin / 2) * board * TILT_SIN));
  return { perspective, scale };
}

/**
 * Offset from the board center, in viewport pixels.
 * x and y are origin-centered board pixels after the quarter turn.
 * z lifts straight off the board.
 */
export function projectTiltedPoint(x: number, y: number, z: number, board: number) {
  const { perspective, scale } = boardCamera(board);
  const sx = scale * x;
  const sy = scale * y;
  const sz = scale * z;
  const y1 = sy * TILT_COS - sz * TILT_SIN;
  const z1 = sy * TILT_SIN + sz * TILT_COS;
  const w = 1 - z1 / perspective;
  return {
    x: sx / w,
    y: y1 / w - board * 0.04,
    depth: z1,
  };
}

const PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

type V3 = { x: number; y: number; z: number };

export type DiePose = {
  /** Die center, origin at the board center, in board pixels. */
  x: number;
  y: number;
  hop: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  turn: number;
  size: number;
  face: number;
};

export type DrawnPip = { x: number; y: number; rx: number; ry: number };

export type DrawnFace = {
  value: number;
  color: string;
  points: { x: number; y: number }[];
  pips: DrawnPip[];
  depth: number;
};

export type ProjectedDie = {
  shadow: DrawnPip;
  faces: DrawnFace[];
};

function rotX(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
}

function rotY(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

function rotZ(p: V3, deg: number): V3 {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
}

function posePoint(local: V3, pose: DiePose): V3 {
  let p = rotZ(local, pose.spinZ);
  p = rotY(p, pose.spinY);
  p = rotX(p, pose.spinX);
  p = { x: p.x + pose.x, y: p.y + pose.y, z: p.z + pose.hop };
  return rotZ(p, pose.turn);
}

function facingCamera(normal: V3, pose: DiePose) {
  let n = rotZ(normal, pose.spinZ);
  n = rotY(n, pose.spinY);
  n = rotX(n, pose.spinX);
  n = rotZ(n, pose.turn);
  return n.y * TILT_SIN + n.z * TILT_COS;
}

function neighborFaces(top: number): number[] {
  const opposite = 7 - top;
  return [1, 2, 3, 4, 5, 6].filter((value) => value !== top && value !== opposite);
}

type FaceSpec = {
  value: number;
  color: string;
  normal: V3;
  at: (u: number, v: number) => V3;
};

function faceSpecs(value: number, size: number): FaceSpec[] {
  const h = size / 2;
  const sides = neighborFaces(value);
  const up = (v: number) => size * (1 - (v + 1) / 2);
  return [
    {
      value,
      color: '#f7f1e6',
      normal: { x: 0, y: 0, z: 1 },
      at: (u, v) => ({ x: u * h, y: v * h, z: size }),
    },
    {
      value: 7 - value,
      color: '#d9cbb3',
      normal: { x: 0, y: 0, z: -1 },
      at: (u, v) => ({ x: -u * h, y: -v * h, z: 0 }),
    },
    {
      value: sides[0],
      color: '#e6d7be',
      normal: { x: 0, y: -1, z: 0 },
      at: (u, v) => ({ x: -u * h, y: -h, z: up(v) }),
    },
    {
      value: sides[1],
      color: '#efe6d4',
      normal: { x: 0, y: 1, z: 0 },
      at: (u, v) => ({ x: u * h, y: h, z: up(v) }),
    },
    {
      value: sides[2],
      color: '#ddd0b6',
      normal: { x: 1, y: 0, z: 0 },
      at: (u, v) => ({ x: h, y: -u * h, z: up(v) }),
    },
    {
      value: sides[3],
      color: '#e9dcc4',
      normal: { x: -1, y: 0, z: 0 },
      at: (u, v) => ({ x: -h, y: u * h, z: up(v) }),
    },
  ];
}

/** The cube as flat faces in the board camera. iPhone cannot keep a CSS cube in 3D. */
export function projectDie(pose: DiePose, board: number): ProjectedDie {
  const h = pose.size / 2;
  const pipRadius = (pose.size * 0.58) / 3 / 2;
  const du = h > 0 ? pipRadius / h : 0;
  const toScreen = (local: V3) => {
    const world = posePoint(local, pose);
    return projectTiltedPoint(world.x, world.y, world.z, board);
  };
  const faces: DrawnFace[] = [];
  for (const spec of faceSpecs(pose.face, pose.size)) {
    if (facingCamera(spec.normal, pose) <= 0.08) continue;
    const corner = (u: number, v: number) => toScreen(spec.at(u, v));
    const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    const marks = PIPS[spec.value] ?? PIPS[1];
    const pips: DrawnPip[] = [];
    marks.forEach((on, index) => {
      if (!on) return;
      const u = (((index % 3) + 0.5) / 3) * 2 - 1;
      const v = ((Math.floor(index / 3) + 0.5) / 3) * 2 - 1;
      const center = toScreen(spec.at(u, v));
      const right = toScreen(spec.at(u + du, v));
      const down = toScreen(spec.at(u, v + du));
      pips.push({
        x: center.x,
        y: center.y,
        rx: Math.max(0.8, Math.hypot(right.x - center.x, right.y - center.y)),
        ry: Math.max(0.8, Math.hypot(down.x - center.x, down.y - center.y)),
      });
    });
    faces.push({
      value: spec.value,
      color: spec.color,
      points: corners.map((point) => ({ x: point.x, y: point.y })),
      pips,
      depth: corners.reduce((sum, point) => sum + point.depth, 0) / corners.length,
    });
  }
  faces.sort((a, b) => a.depth - b.depth);
  const onFelt = (local: V3) => {
    const world = rotZ({ x: local.x + pose.x, y: local.y + pose.y, z: 0 }, pose.turn);
    return projectTiltedPoint(world.x, world.y, world.z, board);
  };
  const shadowCenter = onFelt({ x: 0, y: 0, z: 0 });
  const shadowX = onFelt({ x: h * 0.72, y: 0, z: 0 });
  const shadowY = onFelt({ x: 0, y: h * 0.46, z: 0 });
  return {
    shadow: {
      x: shadowCenter.x,
      y: shadowCenter.y,
      rx: Math.max(1, Math.hypot(shadowX.x - shadowCenter.x, shadowX.y - shadowCenter.y)),
      ry: Math.max(1, Math.hypot(shadowY.x - shadowCenter.x, shadowY.y - shadowCenter.y)),
    },
    faces,
  };
}

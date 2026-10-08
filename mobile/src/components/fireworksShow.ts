export const FIREWORK_SPARK_CAP = 380;

const TAU = Math.PI * 2;

const SHELLS = [
  { trail: '#ffd54a', core: '#fff8e1' },
  { trail: '#ff5252', core: '#ffebee' },
  { trail: '#4fc3f7', core: '#e1f5fe' },
  { trail: '#69f0ae', core: '#e8fff4' },
  { trail: '#ea80fc', core: '#fce4ff' },
  { trail: '#ffab40', core: '#fff3e0' },
  { trail: '#e0f7fa', core: '#ffffff' },
  { trail: '#ff80ab', core: '#fff0f6' },
] as const;

type Shell = (typeof SHELLS)[number];
type ShellKind = 'chrysanthemum' | 'peony' | 'ring' | 'willow' | 'palm' | 'crackle' | 'brocade' | 'glitter';

const KIND_BAG: ShellKind[] = [
  'chrysanthemum',
  'chrysanthemum',
  'peony',
  'ring',
  'willow',
  'palm',
  'crackle',
  'brocade',
  'glitter',
];

const OPENING: Array<{ at: number; kind: ShellKind; x: number; y: number; shell: number }> = [
  { at: 0, kind: 'chrysanthemum', x: 0.22, y: 0.15, shell: 0 },
  { at: 0, kind: 'ring', x: 0.5, y: 0.09, shell: 2 },
  { at: 0, kind: 'peony', x: 0.74, y: 0.17, shell: 7 },
  { at: 0.42, kind: 'willow', x: 0.34, y: 0.13, shell: 0 },
  { at: 0.72, kind: 'brocade', x: 0.66, y: 0.12, shell: 1 },
  { at: 1.15, kind: 'palm', x: 0.22, y: 0.28, shell: 5 },
  { at: 1.38, kind: 'crackle', x: 0.78, y: 0.22, shell: 4 },
  { at: 1.72, kind: 'glitter', x: 0.48, y: 0.2, shell: 0 },
];

const OPACITY_LEVELS = [0.16, 0.34, 0.52, 0.7, 0.86, 1];

type Rng = () => number;

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  core: string;
  drag: number;
  gravity: number;
  trail: number;
  width: number;
  twinkle: number;
  phase: number;
  crackleAt: number;
  crackled: boolean;
  hist: number[];
};

type Rocket = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  life: number;
  shell: Shell;
  kind: ShellKind;
};

type Flash = {
  id: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
};

type Pending = {
  at: number;
  x: number;
  y: number;
  shell: Shell;
  kind: ShellKind;
};

export type FireworkStreak = {
  key: string;
  d: string;
  color: string;
  opacity: number;
  width: number;
};

export type FireworkFlash = {
  id: number;
  x: number;
  y: number;
  color: string;
  ringRadius: number;
  ringOpacity: number;
};

export type FireworkStar = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  gold: boolean;
};

export type FireworkScene = {
  streaks: FireworkStreak[];
  flashes: FireworkFlash[];
  stars: FireworkStar[];
};

export type FireworkShow = {
  resize(width: number, height: number): void;
  step(dt: number): FireworkScene;
  sparkCount(): number;
};

function range(rng: Rng, min: number, max: number) {
  return min + rng() * (max - min);
}

function snapOpacity(value: number) {
  if (value < 0.08) return null;
  let best = OPACITY_LEVELS[0];
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < OPACITY_LEVELS.length; i++) {
    const dist = Math.abs(value - OPACITY_LEVELS[i]);
    if (dist < bestDist) {
      best = OPACITY_LEVELS[i];
      bestDist = dist;
    }
  }
  return best;
}

export function createFireworkShow(width: number, height: number, rng: Rng = Math.random): FireworkShow {
  let viewW = width;
  let viewH = height;
  let elapsed = 0;
  let nextLaunch = 0.2;
  let nextEncore = 3.4;
  let openingIndex = 0;
  let primed = false;
  let flashId = 1;
  let sparks: Spark[] = [];
  let rockets: Rocket[] = [];
  let flashes: Flash[] = [];
  let pending: Pending[] = [];

  const stars = Array.from({ length: 36 }, () => ({
    x: rng(),
    y: rng() * 0.76,
    r: rng() < 0.12 ? range(rng, 1.5, 2.05) : range(rng, 0.55, 1.15),
    phase: rng() * TAU,
    speed: range(rng, 0.7, 2.1),
    gold: rng() < 0.2,
  }));

  function make(init: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    core: string;
    drag: number;
    gravity: number;
    trail: number;
    width: number;
    twinkle?: number;
    crackleAt?: number;
  }): Spark {
    return {
      ...init,
      maxLife: init.life,
      twinkle: init.twinkle ?? 0,
      crackleAt: init.crackleAt ?? 0,
      phase: rng() * TAU,
      crackled: false,
      hist: [],
    };
  }

  function makeRoom(needed: number) {
    const overflow = sparks.length + needed - FIREWORK_SPARK_CAP;
    if (overflow <= 0) return;
    const ranked = sparks
      .map((spark, index) => ({ index, life: spark.life }))
      .sort((a, b) => a.life - b.life);
    const drop = new Set<number>();
    for (let i = 0; i < overflow && i < ranked.length; i++) drop.add(ranked[i].index);
    sparks = sparks.filter((_, index) => !drop.has(index));
  }

  function addSparks(incoming: Spark[]) {
    if (incoming.length === 0) return;
    const batch = incoming.length > FIREWORK_SPARK_CAP ? incoming.slice(0, FIREWORK_SPARK_CAP) : incoming;
    makeRoom(batch.length);
    for (const spark of batch) sparks.push(spark);
  }

  function shellScale() {
    return Math.max(0.9, Math.min(1.45, Math.min(viewW, viewH) / 480));
  }

  function lanes() {
    return Math.max(1, Math.min(2, Math.round(viewW / 900)));
  }

  function skyPoint(side: 'left' | 'right' | 'any' = 'any') {
    const margin = Math.min(viewW * 0.32, Math.max(72, 240 * shellScale()));
    const usable = Math.max(1, viewW - margin * 2);
    let x = margin + rng() * usable;
    if (side === 'left') x = margin + rng() * usable * 0.42;
    if (side === 'right') x = margin + usable * 0.58 + rng() * usable * 0.42;
    const high = rng() < 0.75;
    return {
      x,
      y: high ? viewH * range(rng, 0.08, 0.22) : viewH * range(rng, 0.2, 0.34),
    };
  }

  function pickShell() {
    return SHELLS[Math.floor(rng() * SHELLS.length)];
  }

  function contrast(shell: Shell) {
    const index = SHELLS.indexOf(shell);
    return SHELLS[(index + 3) % SHELLS.length];
  }

  function pistilColor(shell: Shell) {
    return shell.trail === SHELLS[0].trail ? '#e1f5fe' : '#ffd54a';
  }

  function burst(x: number, y: number, shell: Shell, kind: ShellKind) {
    const draft: Spark[] = [];
    const core = shell.core;
    const trail = shell.trail;

    const shoot = (
      angle: number,
      speed: number,
      opts: {
        life: number;
        trail: number;
        drag: number;
        gravity: number;
        width: number;
        color?: string;
        core?: string;
        twinkle?: number;
        crackleAt?: number;
      },
    ) => {
      const scale = shellScale();
      draft.push(
        make({
          x,
          y,
          vx: Math.cos(angle) * speed * scale,
          vy: Math.sin(angle) * speed * scale,
          life: opts.life,
          color: opts.color ?? trail,
          core: opts.core ?? core,
          drag: opts.drag,
          gravity: opts.gravity * scale,
          trail: opts.trail,
          width: opts.width,
          twinkle: opts.twinkle,
          crackleAt: opts.crackleAt,
        }),
      );
    };

    const pistil = (count: number) => {
      const color = pistilColor(shell);
      for (let i = 0; i < count; i++) {
        shoot(rng() * TAU, range(rng, 14, 56), {
          life: range(rng, 0.5, 0.85),
          trail: 0.035,
          drag: 1.35,
          gravity: 95,
          width: 2.1,
          color,
          core: '#fffef8',
          twinkle: range(rng, 12, 20),
        });
      }
    };

    if (kind === 'brocade') {
      burst(x, y, shell, 'chrysanthemum');
      pending.push({ at: elapsed + 0.18, x, y, shell: contrast(shell), kind: 'ring' });
      return;
    }

    if (kind === 'chrysanthemum') {
      const count = 46;
      const turn = rng() * TAU;
      for (let i = 0; i < count; i++) {
        const angle = turn + (i / count) * TAU + (rng() - 0.5) * 0.18;
        shoot(angle, range(rng, 150, 270), {
          life: range(rng, 1.25, 1.85),
          trail: 0.2,
          drag: 0.42,
          gravity: 52,
          width: 1.45,
          color: rng() < 0.16 ? core : trail,
        });
      }
      for (let i = 0; i < 8; i++) {
        shoot(rng() * TAU, range(rng, 230, 320), {
          life: range(rng, 1.5, 2.05),
          trail: 0.26,
          drag: 0.28,
          gravity: 46,
          width: 1.35,
          color: core,
        });
      }
      pistil(12);
    } else if (kind === 'peony') {
      for (let i = 0; i < 36; i++) {
        shoot(rng() * TAU, range(rng, 55, 168), {
          life: range(rng, 0.95, 1.45),
          trail: 0.05,
          drag: 0.95,
          gravity: 88,
          width: 2.45,
          color: rng() < 0.22 ? core : trail,
        });
      }
      pistil(10);
    } else if (kind === 'ring') {
      const count = 40;
      const turn = rng() * TAU;
      const speed = range(rng, 145, 185);
      for (let i = 0; i < count; i++) {
        shoot(turn + (i / count) * TAU + (rng() - 0.5) * 0.04, speed * range(rng, 0.96, 1.04), {
          life: range(rng, 1.15, 1.5),
          trail: 0.08,
          drag: 0.32,
          gravity: 58,
          width: 1.7,
        });
      }
      const inner = 16;
      for (let i = 0; i < inner; i++) {
        shoot(turn + (i / inner) * TAU, speed * 0.58, {
          life: range(rng, 0.8, 1.15),
          trail: 0.045,
          drag: 0.5,
          gravity: 70,
          width: 1.8,
          color: core,
        });
      }
    } else if (kind === 'willow') {
      for (let i = 0; i < 42; i++) {
        shoot(rng() * TAU, range(rng, 36, 96), {
          life: range(rng, 2.2, 3.15),
          trail: 0.24,
          drag: 1.45,
          gravity: 150,
          width: 1.3,
          twinkle: range(rng, 6, 11),
          color: rng() < 0.25 ? core : trail,
        });
      }
    } else if (kind === 'palm') {
      for (let i = 0; i < 26; i++) {
        const angle = -Math.PI / 2 + (rng() - 0.5) * 1.7;
        shoot(angle, range(rng, 130, 250), {
          life: range(rng, 1.35, 1.9),
          trail: 0.17,
          drag: 0.28,
          gravity: 145,
          width: 1.5,
        });
      }
      for (let i = 0; i < 6; i++) {
        shoot(-Math.PI / 2 + range(rng, -0.14, 0.14), range(rng, 200, 300), {
          life: range(rng, 1.2, 1.6),
          trail: 0.2,
          drag: 0.18,
          gravity: 170,
          width: 1.6,
          color: core,
        });
      }
    } else if (kind === 'crackle') {
      for (let i = 0; i < 20; i++) {
        shoot(rng() * TAU, range(rng, 80, 170), {
          life: range(rng, 0.95, 1.3),
          trail: 0.07,
          drag: 0.48,
          gravity: 86,
          width: 1.8,
          crackleAt: range(rng, 0.32, 0.58),
        });
      }
    } else {
      for (let i = 0; i < 34; i++) {
        shoot(rng() * TAU, range(rng, 24, 88), {
          life: range(rng, 1.2, 2),
          trail: 0.04,
          drag: 1.15,
          gravity: 48,
          width: 1.9,
          color: rng() < 0.45 ? '#fffef8' : trail,
          twinkle: range(rng, 14, 26),
        });
      }
    }

    const flashLife = kind === 'willow' ? 0.28 : 0.2;
    flashes.push({
      id: flashId++,
      x,
      y,
      life: flashLife,
      maxLife: flashLife,
      color: core,
      radius: (kind === 'willow' || kind === 'palm' ? 22 : 30) * shellScale(),
    });
    addSparks(draft);
  }

  function launchRocket(side: 'left' | 'right' | 'any' = 'any') {
    if (rockets.length >= 6) return;
    const target = skyPoint(side);
    const shell = pickShell();
    const kind = KIND_BAG[Math.floor(rng() * KIND_BAG.length)];
    const startY = viewH + 14;
    const climb = Math.max(48, startY - target.y);
    const vy = -Math.sqrt(2 * 220 * climb) * range(rng, 1.05, 1.16);
    const x = target.x + range(rng, -28, 28);
    const travel = climb / (Math.abs(vy) * 0.72);
    const vx = Math.max(-70, Math.min(70, (target.x - x) / Math.max(0.35, travel)));
    rockets.push({
      x,
      y: startY,
      vx,
      vy,
      targetY: target.y,
      life: 3.2,
      shell,
      kind,
    });
  }

  function step(dt: number): FireworkScene {
    const clamped = Math.max(0, Math.min(0.05, dt));
    elapsed += clamped;

    if (!primed) {
      primed = true;
      if (lanes() > 1) {
        launchRocket('left');
        launchRocket('right');
      } else {
        launchRocket();
        launchRocket();
      }
    }

    while (openingIndex < OPENING.length && elapsed >= OPENING[openingIndex].at) {
      const cue = OPENING[openingIndex++];
      burst(viewW * cue.x, viewH * cue.y, SHELLS[cue.shell], cue.kind);
    }

    pending = pending.filter((item) => {
      if (elapsed < item.at) return true;
      burst(item.x, item.y, item.shell, item.kind);
      return false;
    });

    if (elapsed >= nextLaunch) {
      if (lanes() > 1) {
        launchRocket('left');
        launchRocket('right');
      } else {
        launchRocket();
      }
      const cadence =
        elapsed < 1.8 ? range(rng, 0.2, 0.34) : elapsed < 4.5 ? range(rng, 0.36, 0.58) : range(rng, 0.5, 0.9);
      nextLaunch = elapsed + cadence;
    }

    if (elapsed >= nextEncore) {
      const point = skyPoint();
      const shell = pickShell();
      burst(point.x, point.y, shell, rng() < 0.5 ? 'brocade' : 'willow');
      nextEncore = elapsed + range(rng, 3.2, 5.1);
    }

    const embers: Spark[] = [];
    const stillFlying: Rocket[] = [];
    for (const rocket of rockets) {
      rocket.vy += 210 * clamped;
      rocket.x += rocket.vx * clamped;
      rocket.y += rocket.vy * clamped;
      rocket.life -= clamped;
      if (rocket.y <= rocket.targetY || rocket.vy > 0 || rocket.life <= 0) {
        burst(rocket.x, rocket.y, rocket.shell, rocket.kind);
        continue;
      }
      stillFlying.push(rocket);
      if (sparks.length < FIREWORK_SPARK_CAP * 0.72) {
        embers.push(
          make({
            x: rocket.x,
            y: rocket.y,
            vx: rocket.vx * 0.35 + range(rng, -12, 12) * shellScale(),
            vy: rocket.vy * 0.18 + range(rng, 28, 80) * shellScale(),
            life: range(rng, 0.18, 0.36),
            color: rng() < 0.35 ? rocket.shell.core : rocket.shell.trail,
            core: '#fffef8',
            drag: 0.85,
            gravity: 70,
            trail: 0.06,
            width: 1.25,
            twinkle: rng() < 0.3 ? 20 : 0,
          }),
        );
      }
    }
    rockets = stillFlying;

    const born: Spark[] = [];
    for (const spark of sparks) {
      const damp = Math.exp(-spark.drag * clamped);
      spark.vx *= damp;
      spark.vy *= damp;
      spark.vy += spark.gravity * clamped;
      spark.x += spark.vx * clamped;
      spark.y += spark.vy * clamped;
      spark.life -= clamped;

      if (!spark.crackled && spark.crackleAt > 0 && spark.life <= spark.crackleAt) {
        spark.crackled = true;
        spark.life = Math.min(spark.life, 0.06);
        for (let i = 0; i < 5; i++) {
          const angle = rng() * TAU;
          const speed = range(rng, 36, 88) * shellScale();
          born.push(
            make({
              x: spark.x,
              y: spark.y,
              vx: spark.vx * 0.22 + Math.cos(angle) * speed,
              vy: spark.vy * 0.22 + Math.sin(angle) * speed,
              life: range(rng, 0.28, 0.5),
              color: rng() < 0.5 ? '#fffef8' : spark.core,
              core: '#ffffff',
              drag: 0.55,
              gravity: 150 * shellScale(),
              trail: 0.07,
              width: 1.3,
              twinkle: range(rng, 16, 28),
            }),
          );
        }
      }

      const history = spark.hist;
      const lastT = history.length >= 3 ? history[history.length - 1] : -1;
      const gap = Math.max(0.016, spark.trail / 3);
      if (lastT < 0 || elapsed - lastT >= gap) {
        history.push(spark.x, spark.y, elapsed);
        while (history.length > 3 && elapsed - history[2] > spark.trail) history.splice(0, 3);
        if (history.length > 12) history.splice(0, history.length - 12);
      }
    }

    addSparks(embers);
    addSparks(born);
    sparks = sparks.filter(
      (spark) =>
        spark.life > 0 &&
        spark.y > -80 &&
        spark.y < viewH + 50 &&
        spark.x > -80 &&
        spark.x < viewW + 80,
    );
    flashes = flashes.filter((flash) => {
      flash.life -= clamped;
      return flash.life > 0;
    });

    const buckets = new Map<string, FireworkStreak>();
    const add = (color: string, opacity: number, width: number, x1: number, y1: number, x2: number, y2: number) => {
      const snapped = snapOpacity(opacity);
      if (snapped == null) return;
      const w = width >= 3.2 ? 3.9 : width >= 1.9 ? 2.25 : 1.35;
      let xe = x2;
      let ye = y2;
      if (Math.abs(xe - x1) < 0.8 && Math.abs(ye - y1) < 0.8) {
        xe = x1 + 1.1;
        ye = y1 + 0.45;
      }
      const key = `${color}|${snapped}|${w}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { key, d: '', color, opacity: snapped, width: w };
        buckets.set(key, bucket);
      }
      bucket.d += `M${Math.round(x1)} ${Math.round(y1)}L${Math.round(xe)} ${Math.round(ye)}`;
    };

    const drawSpark = (spark: Spark) => {
      let alpha = Math.pow(Math.max(0, spark.life / spark.maxLife), 0.72);
      if (spark.twinkle > 0) alpha *= 0.58 + 0.42 * Math.sin(elapsed * spark.twinkle + spark.phase);
      if (alpha < 0.05) return;

      const pts: number[] = [];
      const history = spark.hist;
      for (let i = 0; i < history.length; i += 3) pts.push(history[i], history[i + 1]);
      const tailX = pts.length >= 2 ? pts[pts.length - 2] : spark.x;
      const tailY = pts.length >= 2 ? pts[pts.length - 1] : spark.y;
      if (pts.length < 2 || (spark.x - tailX) ** 2 + (spark.y - tailY) ** 2 > 1) {
        pts.push(spark.x, spark.y);
      }

      const segs = pts.length / 2 - 1;
      if (segs < 1) {
        add(spark.color, alpha, spark.width, spark.x - spark.vx * 0.03, spark.y - spark.vy * 0.03, spark.x, spark.y);
        add(spark.core, Math.min(1, alpha + 0.12), 1.35, spark.x - spark.vx * 0.012, spark.y - spark.vy * 0.012, spark.x, spark.y);
        return;
      }

      for (let s = 0; s < segs; s++) {
        const fade = (s + 1) / segs;
        add(
          spark.color,
          alpha * (0.22 + 0.78 * fade * fade),
          spark.width,
          pts[s * 2],
          pts[s * 2 + 1],
          pts[s * 2 + 2],
          pts[s * 2 + 3],
        );
      }
      const x1 = pts[pts.length - 4];
      const y1 = pts[pts.length - 3];
      const x2 = pts[pts.length - 2];
      const y2 = pts[pts.length - 1];
      add(spark.core, Math.min(1, alpha + 0.08), Math.min(spark.width, 1.7), x1, y1, x2, y2);
      if (alpha > 0.42) add(spark.color, alpha * 0.2, spark.width + 2.6, x1, y1, x2, y2);
    };

    for (const rocket of rockets) {
      add(rocket.shell.trail, 0.62, 1.35, rocket.x - rocket.vx * 0.07, rocket.y - rocket.vy * 0.07, rocket.x, rocket.y);
      add(rocket.shell.core, 0.95, 2.2, rocket.x - rocket.vx * 0.012, rocket.y - rocket.vy * 0.012, rocket.x, rocket.y);
    }
    for (const spark of sparks) drawSpark(spark);

    return {
      streaks: [...buckets.values()].sort((a, b) => b.width - a.width || (a.key < b.key ? -1 : 1)),
      flashes: flashes.map((flash) => {
        const t = Math.max(0, flash.life / flash.maxLife);
        return {
          id: flash.id,
          x: flash.x,
          y: flash.y,
          color: flash.color,
          ringRadius: flash.radius * (0.4 + (1 - t) * 0.85),
          ringOpacity: t * t * 0.5,
        };
      }),
      stars: stars.map((star) => {
        const twinkle = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(elapsed * star.speed + star.phase));
        return {
          x: star.x * viewW,
          y: star.y * viewH,
          r: star.r,
          opacity: twinkle * (star.gold ? 0.85 : 0.7),
          gold: star.gold,
        };
      }),
    };
  }

  return {
    resize(nextWidth: number, nextHeight: number) {
      viewW = nextWidth;
      viewH = nextHeight;
    },
    step,
    sparkCount() {
      return sparks.length;
    },
  };
}

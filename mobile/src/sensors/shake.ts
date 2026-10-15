export type Accel = { x: number; y: number; z: number };

export type AccelUnit = 'g' | 'mps2';

export type ShakeWatch = {
  gravity: Accel | null;
  lastAt: number;
  hot: boolean;
  spikes: number;
  burstStart: number;
  quietUntil: number;
};

const GRAVITY_TAU_MS = 180;
const SPIKE_G = 1.45;
const RELEASE_G = 0.7;
const BURST_MS = 500;
const SPIKES_NEEDED = 2;
const QUIET_MS = 800;
const STANDARD_GRAVITY = 9.80665;

export function freshShakeWatch(): ShakeWatch {
  return {
    gravity: null,
    lastAt: 0,
    hot: false,
    spikes: 0,
    burstStart: 0,
    quietUntil: 0,
  };
}

/** Readings are g-force on some phones and m/s² on others. Lock the unit from a resting sample. */
export function accelInGs(
  sample: Accel,
  unit: AccelUnit | null,
): { accel: Accel; unit: AccelUnit } | null {
  const magnitude = Math.hypot(sample.x, sample.y, sample.z);
  const resolved = unit ?? (magnitude > 4 ? 'mps2' : magnitude > 0.4 ? 'g' : null);
  if (!resolved) return null;
  if (resolved === 'g') return { accel: sample, unit: resolved };
  return {
    accel: {
      x: sample.x / STANDARD_GRAVITY,
      y: sample.y / STANDARD_GRAVITY,
      z: sample.z / STANDARD_GRAVITY,
    },
    unit: resolved,
  };
}

/**
 * A shake is two sharp jolts within half a second. Slow tilts follow gravity
 * and do not count. After a shake, further jolts are ignored briefly so one
 * gesture produces one roll.
 */
export function noteAcceleration(
  watch: ShakeWatch,
  sample: Accel,
  now: number,
): { watch: ShakeWatch; shook: boolean } {
  if (!watch.gravity) {
    return { watch: { ...watch, gravity: sample, lastAt: now }, shook: false };
  }

  const dt = Math.min(200, Math.max(0, now - watch.lastAt));
  const alpha = dt === 0 ? 0 : 1 - Math.exp(-dt / GRAVITY_TAU_MS);
  const gravity = {
    x: watch.gravity.x + alpha * (sample.x - watch.gravity.x),
    y: watch.gravity.y + alpha * (sample.y - watch.gravity.y),
    z: watch.gravity.z + alpha * (sample.z - watch.gravity.z),
  };
  const magnitude = Math.hypot(sample.x - gravity.x, sample.y - gravity.y, sample.z - gravity.z);

  if (now < watch.quietUntil) {
    return {
      watch: {
        gravity,
        lastAt: now,
        hot: magnitude >= RELEASE_G,
        spikes: 0,
        burstStart: watch.burstStart,
        quietUntil: watch.quietUntil,
      },
      shook: false,
    };
  }

  let hot = watch.hot;
  let spikes = watch.spikes;
  let burstStart = watch.burstStart;
  let quietUntil = watch.quietUntil;
  let shook = false;

  if (!hot && magnitude >= SPIKE_G) {
    hot = true;
    if (now - burstStart > BURST_MS) {
      spikes = 0;
      burstStart = now;
    }
    spikes += 1;
    if (spikes >= SPIKES_NEEDED) {
      shook = true;
      spikes = 0;
      quietUntil = now + QUIET_MS;
      hot = false;
    }
  } else if (hot && magnitude < RELEASE_G) {
    hot = false;
  }

  return {
    watch: { gravity, lastAt: now, hot, spikes, burstStart, quietUntil },
    shook,
  };
}

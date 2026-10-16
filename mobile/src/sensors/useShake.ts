import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { DeviceMotion, type DeviceMotionMeasurement } from 'expo-sensors';
import { accelInGs, freshShakeWatch, noteAcceleration, type AccelUnit } from './shake';

type MotionPermission = 'none' | 'prompt' | 'check';

function webMotionPermission(): MotionPermission {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return 'none';
  const request = (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission;
  return typeof request === 'function' ? 'prompt' : 'check';
}

/**
 * Calls `onShake` when the phone is shaken. Devices without a motion sensor,
 * and browsers that never grant motion access, do nothing.
 *
 * iOS Safari only delivers motion after a tap, so the first touch on the page
 * asks for that permission.
 */
export function useShake(onShake: () => void, enabled: boolean) {
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled) return;
    let removed = false;
    let subscription: { remove: () => void } | null = null;
    let ask: (() => void) | null = null;
    const watch = { current: freshShakeWatch() };
    let unit: AccelUnit | null = null;

    const listen = () => {
      if (removed || subscription) return;
      if (Platform.OS !== 'web') DeviceMotion.setUpdateInterval(50);
      const started = Date.now();
      subscription = DeviceMotion.addListener((measurement: DeviceMotionMeasurement) => {
        const raw = measurement.accelerationIncludingGravity;
        if (raw == null || raw.x == null || raw.y == null || raw.z == null) {
          // Desktop browsers emit motion events with no acceleration. Drop the
          // listener once that is clearly all they will send.
          if (Date.now() - started > 1000) {
            subscription?.remove();
            subscription = null;
          }
          return;
        }
        const normalized = accelInGs({ x: raw.x, y: raw.y, z: raw.z }, unit);
        if (!normalized) return;
        unit = normalized.unit;
        const next = noteAcceleration(watch.current, normalized.accel, Date.now());
        watch.current = next.watch;
        if (next.shook) onShakeRef.current();
      });
    };

    const start = async () => {
      try {
        if (Platform.OS === 'web') {
          const permission = webMotionPermission();
          if (permission === 'none' || removed) return;
          if (permission === 'prompt') {
            ask = () => {
              if (ask) window.removeEventListener('pointerdown', ask, true);
              ask = null;
              void DeviceMotion.requestPermissionsAsync()
                .then((response) => {
                  if (!removed && response.granted) listen();
                })
                .catch(() => {});
            };
            window.addEventListener('pointerdown', ask, true);
            return;
          }
          const available = await DeviceMotion.isAvailableAsync();
          if (!available || removed) return;
          listen();
          return;
        }

        const available = await DeviceMotion.isAvailableAsync();
        if (!available || removed) return;
        const current = await DeviceMotion.getPermissionsAsync();
        const response = current.granted ? current : await DeviceMotion.requestPermissionsAsync();
        if (!removed && response.granted) listen();
      } catch {
        // The roll button still works when motion is missing or blocked.
      }
    };

    void start();
    return () => {
      removed = true;
      subscription?.remove();
      if (ask) window.removeEventListener('pointerdown', ask, true);
    };
  }, [enabled]);
}

import { useCallback, useEffect, useRef, useState } from 'react';

export type SparkTone = 'gold' | 'green' | 'rose';

export type Spark = {
  id: number;
  label: string;
  tone: SparkTone;
};

const LIFE_MS = 980;

/** A short, non-blocking flourish for a successful play. Local moves only. */
export function usePlaySpark() {
  const [sparks, setSparks] = useState<Spark[]>([]);
  const nextId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const timer of timers.current) clearTimeout(timer);
    };
  }, []);

  const spark = useCallback((label: string, tone: SparkTone = 'gold') => {
    const id = nextId.current + 1;
    nextId.current = id;
    setSparks((current) => [...current.slice(-4), { id, label, tone }]);
    const timer = setTimeout(() => {
      if (!alive.current) return;
      setSparks((current) => current.filter((item) => item.id !== id));
    }, LIFE_MS);
    timers.current.push(timer);
  }, []);

  return { sparks, spark };
}

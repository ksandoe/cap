// Small deterministic PRNG so variant resolution (§3a/§3b) is reproducible from a seed string
// and never needs to be re-rolled on resume. Not cryptographic — doesn't need to be.

function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;

  constructor(seed: string) {
    this.next = mulberry32(hashStringToSeed(seed));
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.float() * items.length)];
  }

  /** `count` distinct items picked from `items`, without replacement. */
  pickMany<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const result: T[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(this.float() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }

  /** Uniform whole number in [min, max], inclusive. */
  intInRange(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Uniform whole number in [min, max], inclusive, restricted to a step grid from min. */
  intInRangeStep(min: number, max: number, step: number): number {
    const steps = Math.floor((max - min) / step);
    const n = Math.floor(this.float() * (steps + 1));
    return min + n * step;
  }
}

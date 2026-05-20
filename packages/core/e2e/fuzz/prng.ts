/**
 * Seeded PRNG (Mulberry32)
 *
 * 快速、确定性的伪随机数生成器。给定相同 seed 总是产生相同序列。
 */
export function createPRNG(seed: number) {
  let state = seed | 0;

  function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    /** 返回 [0, 1) 的随机浮点数 */
    random: next,

    /** 返回 [min, max] 的随机整数 */
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },

    /** 从数组中随机选一个 */
    pick<T>(arr: T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },

    /** 按权重选择（weights 数组与 items 数组同长） */
    weighted<T>(items: T[], weights: number[]): T {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    /** 当前 seed（用于复现） */
    seed,
  };
}

export type PRNG = ReturnType<typeof createPRNG>;

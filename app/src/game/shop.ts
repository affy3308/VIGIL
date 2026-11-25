/**
 * shop.ts — the meta layer that monetization hangs on. Soft currency
 * («реликты») is earned by blood and spent on heroes and one-run boosts;
 * stars measure campaign mastery per difficulty track. Everything persists
 * in localStorage today — the store calls are isolated here so a real
 * backend / IAP can replace them without touching game code.
 */

import { storage } from "./storage";
import { LEVELS_PER_TRACK, DIFFICULTIES, DEADLY_STAR_GATE } from "./levels";

// ── relics (soft currency) ───────────────────────────────────────────

export const relicsStore = {
  get: (): number => storage.get<number>("vigil.relics", 0),
  add: (n: number) => storage.set("vigil.relics", relicsStore.get() + n),
  /** Returns false when the purse is too light. */
  spend: (n: number): boolean => {
    const cur = relicsStore.get();
    if (cur < n) return false;
    storage.set("vigil.relics", cur - n);
    return true;
  },
};

// ── purchased heroes ─────────────────────────────────────────────────

export const purchasedStore = {
  get: (): string[] => storage.get<string[]>("vigil.purchased", []),
  add: (id: string) => {
    const cur = purchasedStore.get();
    if (!cur.includes(id)) storage.set("vigil.purchased", [...cur, id]);
  },
};

// ── campaign stars (rating) ──────────────────────────────────────────

type StarMap = Record<string, number[]>; // diffId -> 64 entries

export const starsStore = {
  get: (): StarMap => {
    const raw = storage.get<StarMap>("vigil.stars.v1", {});
    for (const d of DIFFICULTIES) {
      if (!Array.isArray(raw[d.id]) || raw[d.id].length !== LEVELS_PER_TRACK) {
        raw[d.id] = new Array(LEVELS_PER_TRACK).fill(0);
      }
    }
    return raw;
  },
  /** Record a result; keeps the best. Returns the new value. */
  record: (diffId: string, levelIndex: number, stars: number): number => {
    const map = starsStore.get();
    const cur = map[diffId][levelIndex] ?? 0;
    const best = Math.max(cur, stars);
    map[diffId][levelIndex] = best;
    storage.set("vigil.stars.v1", map);
    return best;
  },
  total: (): number => {
    const map = starsStore.get();
    let sum = 0;
    for (const d of DIFFICULTIES) for (const s of map[d.id]) sum += s;
    return sum;
  },
  totalFor: (diffId: string): number => {
    const map = starsStore.get();
    return map[diffId].reduce((a, b) => a + b, 0);
  },
};

/**
 * Unlock rule for the campaign grid: level N needs a star on level N-1 of
 * the same track; «Ветеран» additionally asks for the same level cleared
 * on «Рекрут»; «Смертельная» asks for the same level cleared on «Ветеран»
 * and opens only after DEADLY_STAR_GATE veteran stars.
 */
export function levelUnlocked(diffId: string, levelIndex: number, map: StarMap): boolean {
  if (diffId === "deadly") {
    const vetStars = map.veteran.reduce((a, b) => a + b, 0);
    if (vetStars < DEADLY_STAR_GATE) return false;
    if (levelIndex === 0) return map.veteran[0] > 0;
    if (map.deadly[levelIndex - 1] <= 0) return false;
    if (map.veteran[levelIndex] <= 0) return false;
    return true;
  }
  if (levelIndex === 0) return diffId === "recruit" || map.recruit[0] > 0;
  if (map[diffId][levelIndex - 1] <= 0) return false;
  if (diffId !== "recruit" && map.recruit[levelIndex] <= 0) return false;
  return true;
}

/** First level of the track without a star — the «continue» target. */
export function firstUncleared(diffId: string, map: StarMap): number {
  const arr = map[diffId];
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === 0) return levelUnlocked(diffId, i, map) ? i : Math.max(0, i - 1);
  }
  return LEVELS_PER_TRACK - 1;
}

// ── one-run boosts ───────────────────────────────────────────────────

export interface BoostDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  price: number;
}

export const BOOSTS: BoostDef[] = [
  { id: "aegis", name: "Аегис-плита", desc: "+25% к максимуму здоровья на забег", icon: "🛡", price: 100 },
  { id: "litany", name: "Литания ярости", desc: "+15% к урону на забег", icon: "🔥", price: 100 },
  { id: "focus", name: "Психо-фокус", desc: "удар возмездия начинается с зарядом 50%", icon: "☄", price: 80 },
];

/** Boosts armed for the next run; consumed when the run starts. */
export const boostStore = {
  getArmed: (): string[] => storage.get<string[]>("vigil.boosts.armed", []),
  /** Toggle a boost: arm it (paying the price) or disarm (full refund). */
  toggle: (id: string): { armed: boolean; ok: boolean } => {
    const def = BOOSTS.find((b) => b.id === id);
    if (!def) return { armed: false, ok: false };
    const cur = boostStore.getArmed();
    if (cur.includes(id)) {
      storage.set("vigil.boosts.armed", cur.filter((x) => x !== id));
      relicsStore.add(def.price);
      return { armed: false, ok: true };
    }
    if (!relicsStore.spend(def.price)) return { armed: false, ok: false };
    storage.set("vigil.boosts.armed", [...cur, id]);
    return { armed: true, ok: true };
  },
  /** Take the armed boosts for a run start, clearing the rack. */
  consume: (): string[] => {
    const cur = boostStore.getArmed();
    storage.set("vigil.boosts.armed", []);
    return cur;
  },
};

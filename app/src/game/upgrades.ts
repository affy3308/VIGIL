/**
 * upgrades.ts — blessings of the machine-spirit, offered 3-at-a-time between waves.
 * Stat blessings stack; weapon blessings swap the corresponding slot in the loadout.
 */

import { RANGED_WEAPONS, MELEE_WEAPONS } from "./weapons";

export interface Stats {
  damageMul: number;
  fireIntMul: number;
  multishot: number;
  pierce: number;
  speedMul: number;
  dashCdMul: number;
  maxHpBonus: number;
}

export function baseStats(): Stats {
  return { damageMul: 1, fireIntMul: 1, multishot: 1, pierce: 0, speedMul: 1, dashCdMul: 1, maxHpBonus: 0 };
}

export interface Loadout {
  ranged: string;
  melee: string;
}

export interface Upgrade {
  id: string;
  name: string;
  desc: string;
  icon: string;
  /** When set, picking this equips the weapon instead of touching stats. */
  weaponRanged?: string;
  weaponMelee?: string;
  canOffer(s: Stats, l: Loadout): boolean;
  apply(s: Stats): void;
}

const STAT_UPGRADES: Upgrade[] = [
  {
    id: "dmg", name: "Адские болты", icon: "✚",
    desc: "+30% к урону оружия",
    canOffer: () => true,
    apply: (s) => { s.damageMul *= 1.3; },
  },
  {
    id: "rate", name: "Скоростной затвор", icon: "⚡",
    desc: "+22% к скорострельности",
    canOffer: (s) => s.fireIntMul > 0.45,
    apply: (s) => { s.fireIntMul *= 0.82; },
  },
  {
    id: "multi", name: "Раздвоенный заряд", icon: "⋔",
    desc: "+1 снаряд за выстрел (веером)",
    canOffer: (s) => s.multishot < 3,
    apply: (s) => { s.multishot += 1; },
  },
  {
    id: "pierce", name: "Бронебойные сердечники", icon: "➹",
    desc: "Снаряды пробивают +1 врага",
    canOffer: (s) => s.pierce < 3,
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: "speed", name: "Серво-приводы", icon: "➤",
    desc: "+14% к скорости движения",
    canOffer: (s) => s.speedMul < 1.9,
    apply: (s) => { s.speedMul *= 1.14; },
  },
  {
    id: "dash", name: "Реактивная тяга", icon: "↯",
    desc: "Рывок перезаряжается на 28% быстрее",
    canOffer: (s) => s.dashCdMul > 0.35,
    apply: (s) => { s.dashCdMul *= 0.72; },
  },
  {
    id: "hp", name: "Апотекарий ордена", icon: "♥",
    desc: "+30 к максимуму здоровья и полное исцеление",
    canOffer: () => true,
    apply: (s) => { s.maxHpBonus += 30; },
  },
];

const WEAPON_UPGRADES: Upgrade[] = [
  ...RANGED_WEAPONS.filter((w) => w.id !== "bolter").map((w) => ({
    id: `w_${w.id}`, name: w.name, icon: "🔥", desc: `Оружие: ${w.desc}`,
    weaponRanged: w.id,
    canOffer: (_s: Stats, l: Loadout) => l.ranged !== w.id,
    apply: () => { /* handled by the loadout */ },
  })),
  ...MELEE_WEAPONS.filter((w) => w.id !== "knife").map((w) => ({
    id: `m_${w.id}`, name: w.name, icon: "⚔", desc: `Клинок: ${w.desc}`,
    weaponMelee: w.id,
    canOffer: (_s: Stats, l: Loadout) => l.melee !== w.id,
    apply: () => { /* handled by the loadout */ },
  })),
];

export const UPGRADES: Upgrade[] = [...STAT_UPGRADES, ...WEAPON_UPGRADES];

/** Pick `n` distinct offerable blessings — weighted so at least one stat blessing is likely. */
export function rollUpgrades(s: Stats, l: Loadout, n: number): Upgrade[] {
  const stats = STAT_UPGRADES.filter((u) => u.canOffer(s, l));
  const weapons = WEAPON_UPGRADES.filter((u) => u.canOffer(s, l));
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  shuffle(stats);
  shuffle(weapons);
  // one weapon slot in most offers, the rest stats; guarantees variety
  const out: Upgrade[] = [];
  if (weapons.length > 0 && Math.random() < 0.75) out.push(weapons.shift()!);
  while (out.length < n && stats.length > 0) out.push(stats.shift()!);
  while (out.length < n && weapons.length > 0) out.push(weapons.shift()!);
  return shuffle(out).slice(0, n);
}

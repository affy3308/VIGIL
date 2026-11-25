/**
 * weapons.ts — the arsenal of the Vigil. Ranged and melee are separate slots:
 * a Marine carries both, fires with the trigger and swings with E / RMB / ⚔.
 * Numbers are tuned against SPECS in enemies.ts (cultist 42hp, brute 190hp, boss 2300hp).
 */

export interface RangedWeapon {
  id: string;
  name: string;
  desc: string;
  /** Bolts per trigger pull in a fan spread. */
  pellets: number;
  /** Extra bolts fired side-by-side at the same angle (twin-linked). */
  parallel: number;
  damage: number;
  interval: number;
  speed: number;
  life: number;
  pierce: number;
  spread: number;
  /** Explosion radius on impact/expiry (0 = none). */
  aoe: number;
  /** Bullet visual: material + scale. */
  mat: "gold" | "plasma" | "melta";
  scale: [number, number, number];
  sfx: "shot" | "plasmaShot" | "meltaShot";
}

export interface MeleeWeapon {
  id: string;
  name: string;
  desc: string;
  damage: number;
  cooldown: number;
  range: number;
  /** Total swing arc in radians. */
  arc: number;
  knockback: number;
  color: number;
  sfx: "chain" | "power" | "fist" | "blade";
}

export const RANGED_WEAPONS: RangedWeapon[] = [
  {
    id: "bolter", name: "Болтер", desc: "Верный друг Стража",
    pellets: 1, parallel: 0, damage: 26, interval: 0.17, speed: 36, life: 1.1,
    pierce: 0, spread: 0.02, aoe: 0, mat: "gold", scale: [1, 1, 1], sfx: "shot",
  },
  {
    id: "twin", name: "Спаренный болтер", desc: "Два ствола — два голоса возмездия",
    pellets: 1, parallel: 1, damage: 22, interval: 0.16, speed: 36, life: 1.1,
    pierce: 0, spread: 0.02, aoe: 0, mat: "gold", scale: [1, 1, 1], sfx: "shot",
  },
  {
    id: "multibolter", name: "Мультиболтер", desc: "Веер из четырёх болтов за залп",
    pellets: 4, parallel: 0, damage: 16, interval: 0.3, speed: 33, life: 0.9,
    pierce: 0, spread: 0.16, aoe: 0, mat: "gold", scale: [0.8, 0.8, 0.8], sfx: "shot",
  },
  {
    id: "plasma", name: "Плазменная пушка", desc: "Маленькое солнце. Взрывается",
    pellets: 1, parallel: 0, damage: 70, interval: 0.62, speed: 20, life: 1.4,
    pierce: 0, spread: 0, aoe: 3.2, mat: "plasma", scale: [2.6, 2.6, 1.6], sfx: "plasmaShot",
  },
  {
    id: "melta", name: "Мельта", desc: "Короткий луч, испаряющий броню",
    pellets: 1, parallel: 0, damage: 240, interval: 0.95, speed: 34, life: 0.32,
    pierce: 5, spread: 0, aoe: 0, mat: "melta", scale: [3.4, 1.4, 1.6], sfx: "meltaShot",
  },
  {
    id: "multimelta", name: "Мультимельта", desc: "Тройной луч. Танки плачут",
    pellets: 3, parallel: 0, damage: 150, interval: 1.2, speed: 32, life: 0.3,
    pierce: 4, spread: 0.14, aoe: 0, mat: "melta", scale: [2.6, 1.2, 1.4], sfx: "meltaShot",
  },
];

export const MELEE_WEAPONS: MeleeWeapon[] = [
  {
    id: "knife", name: "Боевой нож", desc: "Последний аргумент",
    damage: 30, cooldown: 0.4, range: 2.3, arc: 1.7, knockback: 1.2,
    color: 0xc0c8d0, sfx: "blade",
  },
  {
    id: "chainsword", name: "Цепной меч", desc: "Поёт песнь кромсания",
    damage: 55, cooldown: 0.45, range: 2.7, arc: 2.2, knockback: 1.6,
    color: 0xffd27a, sfx: "chain",
  },
  {
    id: "chainaxe", name: "Цепной топор", desc: "Медленнее. Глубже",
    damage: 95, cooldown: 0.75, range: 2.6, arc: 1.8, knockback: 2.6,
    color: 0xffa040, sfx: "chain",
  },
  {
    id: "powersword", name: "Силовой меч", desc: "Поле разрушения режет всё",
    damage: 85, cooldown: 0.5, range: 2.8, arc: 2.4, knockback: 2,
    color: 0x7df0ff, sfx: "power",
  },
  {
    id: "poweraxe", name: "Силовой топор", desc: "Раскалывает терминаторов",
    damage: 140, cooldown: 0.85, range: 2.7, arc: 1.9, knockback: 3,
    color: 0x7df0ff, sfx: "power",
  },
  {
    id: "powerfist", name: "Силовой кулак", desc: "Кулак. Сила. Тишина после",
    damage: 220, cooldown: 1.25, range: 2.2, arc: 1.5, knockback: 6,
    color: 0xffe97a, sfx: "fist",
  },
];

export function rangedById(id: string): RangedWeapon {
  return RANGED_WEAPONS.find((w) => w.id === id) ?? RANGED_WEAPONS[0];
}
export function meleeById(id: string): MeleeWeapon {
  return MELEE_WEAPONS.find((w) => w.id === id) ?? MELEE_WEAPONS[0];
}

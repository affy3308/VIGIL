/**
 * heroes.ts — the defenders of the Vigil. Each hero is a distinct armour pattern
 * or chassis with its own stats, starting loadout, passive trait and ultimate.
 * Four are on the roster from the start; the rest are earned with campaign
 * stars — or bought outright with relics (the soft-currency path).
 */

import { storage } from "./storage";

export type UltKind = "orbital" | "nova" | "rockets";

export const ULT_NAMES: Record<UltKind, string> = {
  orbital: "Орбитальный удар",
  nova: "Экстерминатус",
  rockets: "Ракетный залп",
};

export interface HeroDef {
  id: string;
  name: string;
  /** Armour pattern / chassis. */
  pattern: string;
  desc: string;
  hp: number;
  /** Base movement multiplier (upgrades stack on top). */
  speedMul: number;
  /** Flat damage reduction 0..0.5 (armour soak). */
  armor: number;
  dashCdMul: number;
  /** Model scale + which builder body to use. */
  scale: number;
  model: "marine" | "terminator" | "dreadnought";
  /** Armour tint / trim colours. */
  tint: number;
  trim: number;
  ranged: string;
  melee: string;
  ult: UltKind;
  passive?: {
    /** HP regenerated per second. */
    regen?: number;
    /** Melee damage multiplier. */
    meleeMul?: number;
    /** Ultimate charge rate multiplier. */
    ultMul?: number;
  };
  /** Total campaign stars (both tracks) that open this hero for free. */
  stars: number;
  /** Relic price — the shortcut past the grind. 0 = not purchasable. */
  price: number;
}

export const HEROES: HeroDef[] = [
  {
    id: "strazh", name: "Страж Оплота", pattern: "Силовая броня Mk VII «Аквила»",
    desc: "Линейный боец ордена. Баланс без слабостей.",
    hp: 100, speedMul: 1.0, armor: 0, dashCdMul: 1,
    scale: 1, model: "marine", tint: 0x2e3a4a, trim: 0xc9a227,
    ranged: "bolter", melee: "knife", ult: "orbital",
    stars: 0, price: 0,
  },
  {
    id: "shturm", name: "Штурмовик", pattern: "Штурмовая броня с ранцем вахты",
    desc: "Быстрый клинок. Живёт в ближнем бою.",
    hp: 90, speedMul: 1.18, armor: 0, dashCdMul: 0.75,
    scale: 0.98, model: "marine", tint: 0x3a2e3e, trim: 0xc9a227,
    ranged: "twin", melee: "chainsword", ult: "nova",
    stars: 0, price: 0,
  },
  {
    id: "opusto", name: "Опустошитель", pattern: "Тяжёлая броня опустошителей",
    desc: "Медленнее, но несёт плазму и лишнюю плиту.",
    hp: 130, speedMul: 0.9, armor: 0.12, dashCdMul: 1.1,
    scale: 1.06, model: "marine", tint: 0x24382e, trim: 0xd4b24a,
    ranged: "plasma", melee: "knife", ult: "orbital",
    stars: 0, price: 0,
  },
  {
    id: "skaut", name: "Скаут", pattern: "Лёгкая броня Mk X «Фобос»",
    desc: "Глаза и ножи ордена. Очень быстрый, очень хрупкий.",
    hp: 70, speedMul: 1.32, armor: 0, dashCdMul: 0.7,
    scale: 0.92, model: "marine", tint: 0x2a3026, trim: 0x8a8f7a,
    ranged: "bolter", melee: "knife", ult: "orbital",
    stars: 0, price: 0,
  },
  {
    id: "stern", name: "Стернгард", pattern: "Броня ветеранов с особыми болтами",
    desc: "Ветеран тысячи осад. Мультиболтер — его язык.",
    hp: 120, speedMul: 1.0, armor: 0.08, dashCdMul: 1,
    scale: 1.02, model: "marine", tint: 0x3a3230, trim: 0xd4b24a,
    ranged: "multibolter", melee: "chainsword", ult: "rockets",
    stars: 6, price: 150,
  },
  {
    id: "apotek", name: "Апотекарий", pattern: "Белоснежная броня Апотекариона",
    desc: "Нарцетикум и редуктор. Сам себя лечит.",
    hp: 110, speedMul: 1.02, armor: 0.05, dashCdMul: 1,
    scale: 1, model: "marine", tint: 0x6a7076, trim: 0xc9a227,
    ranged: "bolter", melee: "powersword", ult: "nova",
    passive: { regen: 1.4 },
    stars: 12, price: 200,
  },
  {
    id: "bibliy", name: "Либрарий", pattern: "Лазурная броня Либрариуса",
    desc: "Психо-кондуит ордена. Удар копится быстрее.",
    hp: 100, speedMul: 1.0, armor: 0, dashCdMul: 0.95,
    scale: 1, model: "marine", tint: 0x1e3a5e, trim: 0xd4b24a,
    ranged: "plasma", melee: "powersword", ult: "nova",
    passive: { ultMul: 1.5 },
    stars: 18, price: 250,
  },
  {
    id: "term", name: "Терминатор", pattern: "Тактическая броня дредноута «Индомитус»",
    desc: "Ходячий бастион. Штурм-болтер и силовой кулак.",
    hp: 250, speedMul: 0.78, armor: 0.3, dashCdMul: 1.25,
    scale: 1.3, model: "terminator", tint: 0x3a3f4e, trim: 0xd4b24a,
    ranged: "twin", melee: "powerfist", ult: "rockets",
    stars: 30, price: 400,
  },
  {
    id: "kapellan", name: "Капеллан", pattern: "Чёрный панцирь Реклюзиама",
    desc: "Литания ненависти. Клинок бьёт в полтора раза сильнее.",
    hp: 160, speedMul: 1.05, armor: 0.1, dashCdMul: 0.95,
    scale: 1.04, model: "marine", tint: 0x16161a, trim: 0xd8d3c3,
    ranged: "bolter", melee: "poweraxe", ult: "nova",
    passive: { meleeMul: 1.5 },
    stars: 45, price: 500,
  },
  {
    id: "kentur", name: "Кентурион", pattern: "Осадный доспех «Кентурион»",
    desc: "Между терминатором и дредноутом. Стена, что идёт.",
    hp: 330, speedMul: 0.7, armor: 0.35, dashCdMul: 1.35,
    scale: 1.45, model: "terminator", tint: 0x44322a, trim: 0xc9a227,
    ranged: "twin", melee: "powerfist", ult: "rockets",
    stars: 60, price: 700,
  },
  {
    id: "dread", name: "Дредноут", pattern: "Саркофаг «Кастраферрум»",
    desc: "Погребённый заживо герой. Мультимельта и кулак.",
    hp: 450, speedMul: 0.62, armor: 0.42, dashCdMul: 1.45,
    scale: 1.65, model: "dreadnought", tint: 0x32363f, trim: 0xc9a227,
    ranged: "multimelta", melee: "powerfist", ult: "rockets",
    stars: 90, price: 1000,
  },
  {
    id: "redemptor", name: "Редемптор", pattern: "Дредноут «Редемптор»",
    desc: "Новейший саркофаг. Больше, злее, неуязвимее.",
    hp: 560, speedMul: 0.66, armor: 0.46, dashCdMul: 1.4,
    scale: 1.85, model: "dreadnought", tint: 0x3f3232, trim: 0xd4b24a,
    ranged: "multimelta", melee: "powerfist", ult: "rockets",
    stars: 150, price: 1500,
  },
];

export function heroUnlocked(h: HeroDef, totalStars: number, purchased: string[]): boolean {
  return h.stars === 0 || totalStars >= h.stars || purchased.includes(h.id);
}

export const selectedHero = {
  get: () => storage.get<string>("vigil.hero", "strazh"),
  set: (id: string) => storage.set("vigil.hero", id),
};

export function heroById(id: string): HeroDef {
  return HEROES.find((h) => h.id === id) ?? HEROES[0];
}

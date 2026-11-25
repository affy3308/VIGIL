/**
 * levels.ts — the campaign generator. Two difficulty tracks («Рекрут» and
 * «Ветеран»), 64 levels each. Every level is an 8-map operation: seven
 * defensive waves across shifting grounds, then the faction boss on the
 * eighth. Levels weave all eight enemy factions into one long crusade —
 * each act of 8 levels visits every faction in a rotated order, so the
 * story keeps moving: heresy, the void, greenskins, the tomb, the steppe,
 * the vault, the webway, the swarm.
 */

import type { EnemyKind } from "./enemies";

// ── factions ─────────────────────────────────────────────────────────

interface FactionDef {
  id: string;
  /** Index into BIOMES in world.ts. */
  biome: number;
  boss: EnemyKind;
  bossName: string;
  /** Weighted pool for regular waves. */
  regulars: EnemyKind[];
  escort: EnemyKind[];
  /** Place names per act (level title flavour). */
  places: string[];
  /** Epigraph lines, rotated by act. */
  flavor: string[];
}

const FACTIONS: FactionDef[] = [
  {
    id: "heresy", biome: 0, boss: "boss", bossName: "ВЕСТНИК ПОГИБЕЛИ",
    regulars: ["cultist", "cultist", "cultist", "spitter", "chaos", "brute"],
    escort: ["cultist", "chaos"],
    places: ["Реликварий", "Сожжённый Хор", "Крипта Гимнов", "Апсида Скорби"],
    flavor: [
      "Братья, которым ты верил, открыли врата тьме. Забери святыню обратно — камень за камнем.",
      "Хор монастыря ещё дымится. В нём поют уже не гимны — режь певцов, пока песнь не кончилась.",
      "Под обрушенным нефом шевелятся бывшие послушники. У ордена нет тюрьмы — есть только суд.",
      "Вестник ждёт у алтаря, где ты приносил присягу. Повтори её. Громко.",
    ],
  },
  {
    id: "void", biome: 1, boss: "bossDemon", bossName: "КНЯЗЬ ВАРПА",
    regulars: ["cultist", "chaos", "chaos", "spitter", "brute", "cultist"],
    escort: ["chaos", "cultist"],
    places: ["Палуба «Немезиды»", "Трюм «Немезиды»", "Мостик «Немезиды»", "Машинное Отделение"],
    flavor: [
      "Ударный крейсер жив, но его команда смотрит в варп. Отбей корабль — он ещё нужен Империуму.",
      "В трюмах гаснут лампы одна за другой. Экипаж шепчет имена, которых не знал вчера.",
      "Мостик держат изменники в доспехах ордена. Сними с них эту броню. Вместе с кожей.",
      "Машинный дух крейсера воет. Князь варпа гложет его из ядра — вырежь заразу.",
    ],
  },
  {
    id: "waagh", biome: 2, boss: "bossGargant", bossName: "ГАРГАНТ",
    regulars: ["ork", "ork", "ork", "ork", "brute", "spitter"],
    escort: ["ork"],
    places: ["Пепельные Дюны", "Госпромноль", "Хайв Смерти", "Лагерь Вожака"],
    flavor: [
      "Армагеддон горит зелёным. Здесь нет тыла: куда ни ступи — везде WAAAGH.",
      "Орочьи механики собирают что-то большое за дюнами. Узнай что — и сломай.",
      "Хайв пал за три дня. Его улицы теперь принадлежат зеленокожим. Верни хотя бы пепел.",
      "Гора из костей и ржавчины встала на ноги. Гаргант идёт. Останови гору.",
    ],
  },
  {
    id: "tomb", biome: 3, boss: "bossPhaeron", bossName: "ФАЭРОН АНАКХОС",
    regulars: ["necron", "necron", "necron", "gaunt", "spitter", "brute"],
    escort: ["necron"],
    places: ["Спящий Сектор", "Залы Молчания", "Каноптек-Путь", "Тронный Саркофаг"],
    flavor: [
      "Под пеплом мёртвого спутника нет камня — есть металл, который дышит. Гробница просыпается.",
      "Зелёный свет поднимается из шлюзов. Они не умирают, Страж. Они вспоминают.",
      "Каноптек-машины чинят то, что ты ломаешь. Ломай быстрее, чем они успевают.",
      "Фаэрон считал эоны, и твоя жизнь в его расчётах — пыль. Докажи обратное.",
    ],
  },
  {
    id: "kovue", biome: 4, boss: "bossCrisis", bossName: "ПРЕСВЕТЛЫЙ КЛИНОК",
    regulars: ["tau", "tau", "tau", "cultist", "spitter", "brute", "eldar"],
    escort: ["tau"],
    places: ["Степной Кордон", "Огонь Доктрины", "Плацдарм Ковуэ", "Линия Монтау"],
    flavor: [
      "Маршрут сквозь сектор лежит через зону Экспансии. Их доктрина проста: чужаков не пропускают.",
      "Степь кажется пустой, пока импульсные заряды не скашивают металл вокруг тебя.",
      "Они предложили сдаться. По-боевому вежливо. Ответь так, как ответил бы орден.",
      "Командир в кризис-броне ждёт на равнине. Он никогда не проигрывал. Всё бывает впервые.",
    ],
  },
  {
    id: "leagues", biome: 5, boss: "bossTan", bossName: "ВЕЛИКИЙ ТАН",
    regulars: ["votann", "votann", "votann", "brute", "cultist", "spitter"],
    escort: ["votann"],
    places: ["Внешняя Кузня", "Шахты Завета", "Зал Предков", "Хранилище Танов"],
    flavor: [
      "Карту сквозь варп-шторма хранят Лиги Вотаннов. Ничего не отдают чужакам без цены.",
      "Цена названа: докажи силу в их кузне. Обидишься — впишут в Книгу Обид. Уже вписали.",
      "Залы гудят песней предков. Подпевать не советую: тут это боевой клич.",
      "Великий Тан выходит сам. Оскорблённых предков не услышишь — увидишь.",
    ],
  },
  {
    id: "webway", biome: 6, boss: "bossWraith", bossName: "ПРИЗРАЧНЫЙ ЛОРД",
    regulars: ["eldar", "eldar", "eldar", "eldar", "spitter", "brute"],
    escort: ["eldar"],
    places: ["Доки Паутины", "Сад Хрусталя", "Путь Провидцев", "Купол Бесконечности"],
    flavor: [
      "Паутина эльдар — единственная тропа в сердце флота-улья. Её стражи не верят людям.",
      "Их Видящая откроет врата, если докажешь: человечеству есть что терять.",
      "Испытание идёт по кругу, как их время. Сломай круг.",
      "Призрачный лорд — это мёртвый герой в костяной броне. У него есть вопрос. Ответь.",
    ],
  },
  {
    id: "swarm", biome: 7, boss: "bossFex", bossName: "КАРНИФЕКС",
    regulars: ["gaunt", "gaunt", "gaunt", "gaunt", "gaunt", "spitter", "brute"],
    escort: ["gaunt"],
    places: ["Пищевод Роя", "Гнездовые Трубы", "Синаптический Узел", "Сердце Корабля"],
    flavor: [
      "Живой корабль жрёт мир под тобой. Прогуляйся по его глотке с болтером наперевес.",
      "Стены дышат. Пол пульсирует. Старайся не думать, чем это всё было вчера.",
      "Чем глубже, тем громче хор миллиардов голодных ртов. Не слушай. Стреляй.",
      "Синаптический узел за спиной Карнифекса. Сожги зверя — и Рой ослепнет.",
    ],
  },
];

/** Act frames — the crusade's second voice, one per act. */
const ACT_FRAMES = [
  "Акт I. Искра ещё тлеет — не дай ей стать пожаром.",
  "Акт II. Враг понял, что ты не погиб. Теперь он готовится.",
  "Акт III. Сектор смотрит на тебя. Одни — с надеждой, остальные — с голодом.",
  "Акт IV. Полпути пройдено. Полпути до конца — любого конца.",
  "Акт V. Варп бурлит. Союзники молчат. У тебя есть болтер — этого достаточно.",
  "Акт VI. Имя твоё уже в их пророчествах. Впиши его глубже.",
  "Акт VII. Последний рубеж перед сердцем бури. Ни шагу назад.",
  "Акт VIII. Финал написан не будет — пока ты не напишешь его сам.",
];

// ── plan types ───────────────────────────────────────────────────────

export interface WavePlan {
  biome: number;
  /** Index into LAYOUTS in world.ts. */
  layout: number;
  roster: EnemyKind[];
}

export interface LevelPlan {
  /** 0..63 within its difficulty track. */
  index: number;
  name: string;
  epigraph: string;
  bossName: string;
  waves: WavePlan[]; // 8 entries; the last roster starts with the boss kind
}

export const LEVELS_PER_TRACK = 64;
export const WAVES_PER_LEVEL = 8;

export interface DifficultyDef {
  id: "recruit" | "veteran" | "deadly";
  name: string;
  hpMul: number;
  dmgMul: number;
  /** Extra bodies in every regular wave. */
  countBonus: number;
  /** Spawn interval multiplier (lower = faster tide). */
  spawnMul: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: "recruit", name: "РЕКРУТ", hpMul: 1.0, dmgMul: 1.0, countBonus: 0, spawnMul: 1.0 },
  { id: "veteran", name: "ВЕТЕРАН", hpMul: 1.5, dmgMul: 1.3, countBonus: 2, spawnMul: 0.85 },
  { id: "deadly", name: "СМЕРТЕЛЬНАЯ", hpMul: 2.0, dmgMul: 1.6, countBonus: 4, spawnMul: 0.72 },
];

/** Veteran stars that open the «Смертельная» track. */
export const DEADLY_STAR_GATE = 96;

const shuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Build the level plan. Factions rotate with step 3 (coprime with 8), so every
 * act visits all eight foes in a different order and no two neighbours repeat.
 * Waves 3 and 6 are "shift" maps: the front spills into a neighbour faction's
 * ground and its warriors mix into the roster.
 */
export function buildLevel(index: number, diff: DifficultyDef): LevelPlan {
  const act = Math.floor(index / 8); // 0..7
  const pos = index % 8;
  const fi = (pos + act * 3) % 8;
  const f = FACTIONS[fi];
  const guestA = FACTIONS[(fi + 1) % 8];
  const guestB = FACTIONS[(fi + 7) % 8];

  const waves: WavePlan[] = [];
  for (let w = 1; w <= WAVES_PER_LEVEL; w++) {
    const bossWave = w === WAVES_PER_LEVEL;
    if (bossWave) {
      const escort: EnemyKind[] = [f.boss];
      const escorts = 2 + Math.min(4, act);
      for (let i = 0; i < escorts; i++) escort.push(f.escort[i % f.escort.length]);
      waves.push({ biome: f.biome, layout: 0, roster: escort });
      break;
    }
    // guest grounds on the 3rd and 6th map of the operation
    const guest = w === 3 ? guestA : w === 6 ? guestB : null;
    const biome = guest ? guest.biome : f.biome;
    const total = 6 + w + Math.floor(act * 1.5) + diff.countBonus;
    const roster: EnemyKind[] = [];
    for (let i = 0; i < total; i++) {
      if (guest && i % 3 === 0) {
        roster.push(guest.regulars[(i * 5 + w) % guest.regulars.length]);
      } else {
        roster.push(f.regulars[(i * 7 + w) % f.regulars.length]);
      }
    }
    waves.push({ biome, layout: (index * 3 + w) % 4, roster: shuffle(roster) });
  }

  const place = f.places[act % f.places.length];
  return {
    index,
    name: `УР. ${index + 1} — ${place}`,
    epigraph: `${f.flavor[act % f.flavor.length]}\n${ACT_FRAMES[act]}`,
    bossName: f.bossName,
    waves,
  };
}

/** Enemy scaling for a spawn inside a level run. */
export function waveScaling(levelIndex: number, waveInLevel: number, diff: DifficultyDef): { hpMul: number; dmgMul: number } {
  return {
    hpMul: (1 + 0.045 * levelIndex) * (1 + 0.09 * (waveInLevel - 1)) * diff.hpMul,
    dmgMul: (1 + 0.02 * levelIndex) * (1 + 0.05 * (waveInLevel - 1)) * diff.dmgMul,
  };
}

/** Star thresholds → total stars (both tracks) needed to unlock a hero. */
export const STAR_TOTAL = LEVELS_PER_TRACK * 3 * DIFFICULTIES.length; // 384

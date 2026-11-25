/**
 * hud.ts — all DOM UI: top bar, boss bar, screens (title / campaign / briefing /
 * upgrade / pause / game over / victory), damage vignette, crosshair, touch
 * controls. Russian, grimdark. React never sees any of this — the game writes
 * straight into #ui-overlay.
 */

import type { Upgrade } from "./upgrades";
import { heroUnlocked, ULT_NAMES, type HeroDef } from "./heroes";
import { DIFFICULTIES, LEVELS_PER_TRACK, STAR_TOTAL, DEADLY_STAR_GATE, type DifficultyDef, type LevelPlan } from "./levels";
import { levelUnlocked, BOOSTS, type BoostDef } from "./shop";

export interface HudCallbacks {
  /** Quick start: continue the campaign at the first uncleared level. */
  onStart(): void;
  onRestart(): void;
  onResume(): void;
  onPickUpgrade(i: number): void;
  onToggleMute(): void;
  onDash(): void;
  onMelee(): void;
  onUlt(): void;
  onPause(): void;
  onSelectHero(id: string): void;
  onOpenCampaign(): void;
  onCampaignTab(diffId: string): void;
  onSelectLevel(diffId: string, index: number): void;
  onBriefingStart(): void;
  onBackToTitle(): void;
  onNextLevel(): void;
  onToggleBoost(id: string): void;
}

const CONTROLS_DESKTOP = "WASD — движение · мышь — прицел · ЛКМ — огонь · E/ПКМ — клинок · Q — удар возмездия · SHIFT/ПРОБЕЛ — рывок · ESC — пауза · M — звук";
const CONTROLS_MOBILE = "Левый стик — движение · правый стик — прицел и огонь · ⚔ — клинок · ↯ — рывок · ☄ — удар возмездия";

export interface HeroRenderCtx {
  stars: number;
  purchased: string[];
  relics: number;
}

export class Hud {
  private root: HTMLElement;
  private cb: HudCallbacks;
  readonly isTouch: boolean;

  private topBar!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private waveText!: HTMLElement;
  private scoreText!: HTMLElement;
  private bestText!: HTMLElement;
  private bossBar!: HTMLElement;
  private bossFill!: HTMLElement;
  private bossLabel!: HTMLElement;
  private dashPip!: HTMLElement;
  private ultPip!: HTMLElement;
  private vignette!: HTMLElement;
  private crosshair!: HTMLElement;
  private muteBtn!: HTMLElement;
  private screens: Record<string, HTMLElement> = {};
  private upgradeCards!: HTMLElement;
  private goScore!: HTMLElement;
  private goRelics!: HTMLElement;
  private vicScore!: HTMLElement;
  private vicStars!: HTMLElement;
  private vicRelics!: HTMLElement;
  private vicNextBtn!: HTMLElement;
  private titleMeta!: HTMLElement;
  private stickL!: HTMLElement;
  private stickLKnob!: HTMLElement;
  private stickR!: HTMLElement;
  private stickRKnob!: HTMLElement;
  private dashBtn!: HTMLElement;
  private meleeBtn!: HTMLElement;
  private ultBtn!: HTMLElement;
  private weaponText!: HTMLElement;
  private pauseBtn!: HTMLElement;
  private heroRow!: HTMLElement;
  private boostRow!: HTMLElement;
  private unlockGo!: HTMLElement;
  private unlockVic!: HTMLElement;
  private campaignTabs!: HTMLElement;
  private campaignGrid!: HTMLElement;
  private briefingBody!: HTMLElement;
  private boostsRow!: HTMLElement;
  private boostSig = "";
  private toastEl!: HTMLElement;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    this.isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.root.innerHTML = ""; // drop any orphaned HUD from a disposed previous session
    this.build();
  }

  /** Remove every HUD element — call from Game.dispose so a remount never leaves ghost screens. */
  dispose(): void {
    this.root.innerHTML = "";
  }

  private el(tag: string, cls: string, parent: HTMLElement, html = ""): HTMLElement {
    const e = document.createElement(tag);
    e.className = cls;
    if (html) e.innerHTML = html;
    parent.appendChild(e);
    return e;
  }

  private build(): void {
    // ── top bar ──
    const top = this.el("div", "v-top", this.root);
    this.topBar = top;
    const hpWrap = this.el("div", "v-hp-wrap", top);
    this.el("div", "v-hp-label", hpWrap, "ЦЕЛОСТНОСТЬ");
    const hpBar = this.el("div", "v-hpbar", hpWrap);
    this.hpFill = this.el("div", "v-hpfill", hpBar);
    this.hpText = this.el("div", "v-hptext", hpBar, "100");
    const mid = this.el("div", "v-mid", top);
    this.waveText = this.el("div", "v-wave", mid, "");
    this.bossBar = this.el("div", "v-bossbar", mid);
    this.bossLabel = this.el("div", "v-boss-label", this.bossBar, "");
    const bossTrack = this.el("div", "v-bosstrack", this.bossBar);
    this.bossFill = this.el("div", "v-bossfill", bossTrack);
    this.bossBar.style.display = "none";
    const right = this.el("div", "v-right", top);
    this.scoreText = this.el("div", "v-score", right, "СЧЁТ 0");
    this.bestText = this.el("div", "v-best", right, "");
    this.muteBtn = this.el("button", "v-icon-btn", right, "♪");
    this.muteBtn.addEventListener("click", () => this.cb.onToggleMute());
    this.pauseBtn = this.el("button", "v-icon-btn v-touch-only", right, "Ⅱ");
    this.pauseBtn.addEventListener("click", () => this.cb.onPause());

    // ── dash + ult pips (desktop) ──
    this.dashPip = this.el("div", "v-dash", this.root, "РЫВОК ✓");
    this.ultPip = this.el("div", "v-dash v-ult", this.root, "");

    // ── active battlefield boons + toast ──
    this.boostsRow = this.el("div", "v-aboosts", this.root);
    this.toastEl = this.el("div", "v-toast", this.root);

    // ── vignette ──
    this.vignette = this.el("div", "v-vignette", this.root);

    // ── crosshair (desktop) ──
    this.crosshair = this.el("div", "v-crosshair", this.root);

    // ── touch controls ──
    this.stickL = this.el("div", "v-stick", this.root);
    this.stickLKnob = this.el("div", "v-stick-knob", this.stickL);
    this.stickR = this.el("div", "v-stick v-stick-aim", this.root);
    this.stickRKnob = this.el("div", "v-stick-knob", this.stickR);
    this.stickL.style.display = "none";
    this.stickR.style.display = "none";
    this.dashBtn = this.el("button", "v-dashbtn v-touch-only", this.root, "↯");
    this.dashBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.cb.onDash();
    });
    this.meleeBtn = this.el("button", "v-meleebtn v-touch-only", this.root, "⚔");
    this.meleeBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.cb.onMelee();
    });
    this.ultBtn = this.el("button", "v-ultbtn v-touch-only", this.root, "☄");
    this.ultBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.cb.onUlt();
    });
    this.weaponText = this.el("div", "v-weapon", this.root, "");

    // ── title ──
    this.screens.title = this.el("div", "v-screen", this.root);
    this.el("div", "v-title-small", this.screens.title, "В 41-ОМ ТЫСЯЧЕЛЕТИИ ЕСТЬ ТОЛЬКО ВОЙНА");
    this.el("div", "v-title", this.screens.title, "VIGIL");
    this.el("div", "v-subtitle", this.screens.title, "ПОСЛЕДНИЙ ОПЛОТ");
    this.el("div", "v-flavor", this.screens.title,
      "Собор-крепость пал. Орден мёртв. Ты — последний Страж.<br>Три кампании по 64 операции. Ни шагу назад.");
    const startBtn = this.el("button", "v-btn", this.screens.title,
      this.isTouch ? "ПРОДОЛЖИТЬ КРЕСТОВЫЙ ПОХОД" : "ПРОДОЛЖИТЬ ПОХОД [ПРОБЕЛ]");
    startBtn.addEventListener("click", () => this.cb.onStart());
    const campBtn = this.el("button", "v-btn v-btn-dim", this.screens.title, "КАРТА КАМПАНИИ");
    campBtn.addEventListener("click", () => this.cb.onOpenCampaign());
    this.titleMeta = this.el("div", "v-title-meta", this.screens.title, "");
    this.boostRow = this.el("div", "v-boost-row", this.screens.title);
    // hero roster lives in the title flow — below the boost rack
    this.heroRow = this.el("div", "v-hero-row", this.screens.title);
    this.el("div", "v-controls", this.screens.title, this.isTouch ? CONTROLS_MOBILE : CONTROLS_DESKTOP);

    // ── campaign map ──
    this.screens.campaign = this.el("div", "v-screen", this.root);
    this.el("div", "v-screen-h", this.screens.campaign, "КАРТА КРЕСТОВОГО ПОХОДА");
    this.campaignTabs = this.el("div", "v-camp-tabs", this.screens.campaign);
    this.campaignGrid = this.el("div", "v-camp-grid", this.screens.campaign);
    const campBack = this.el("button", "v-btn v-btn-dim", this.screens.campaign, "НАЗАД");
    campBack.addEventListener("click", () => this.cb.onBackToTitle());

    // ── briefing ──
    this.screens.briefing = this.el("div", "v-screen", this.root);
    this.briefingBody = this.el("div", "v-briefing", this.screens.briefing);

    // ── upgrade ──
    this.screens.upgrade = this.el("div", "v-screen", this.root);
    this.el("div", "v-screen-h", this.screens.upgrade, "КАРТА ЗАЧИЩЕНА");
    this.el("div", "v-screen-sub", this.screens.upgrade, "Машинный дух предлагает благословение. Выбери одно.");
    this.upgradeCards = this.el("div", "v-cards", this.screens.upgrade);

    // ── pause ──
    this.screens.paused = this.el("div", "v-screen", this.root);
    this.el("div", "v-screen-h", this.screens.paused, "ПЕРЕДЫШКА");
    this.el("div", "v-screen-sub", this.screens.paused, "Враг ждёт за стенами. Недолго.");
    const resumeBtn = this.el("button", "v-btn", this.screens.paused, this.isTouch ? "ВЕРНУТЬСЯ В БОЙ" : "ВЕРНУТЬСЯ В БОЙ [ESC]");
    resumeBtn.addEventListener("click", () => this.cb.onResume());
    const pauseRestart = this.el("button", "v-btn v-btn-dim", this.screens.paused, "НАЧАТЬ ЗАНОВО");
    pauseRestart.addEventListener("click", () => this.cb.onRestart());
    const pauseQuit = this.el("button", "v-btn v-btn-dim", this.screens.paused, "ПОКИНУТЬ ОПЕРАЦИЮ");
    pauseQuit.addEventListener("click", () => this.cb.onBackToTitle());

    // ── game over ──
    this.screens.gameover = this.el("div", "v-screen", this.root);
    this.el("div", "v-screen-h v-red", this.screens.gameover, "ОПЕРАЦИЯ ПРОВАЛЕНА");
    this.el("div", "v-screen-sub", this.screens.gameover, "Имя твоё вывесят в Зале Героев. Война продолжится без тебя.");
    this.goScore = this.el("div", "v-final-score", this.screens.gameover, "");
    this.goRelics = this.el("div", "v-relic-note", this.screens.gameover, "");
    this.unlockGo = this.el("div", "v-unlock-note", this.screens.gameover, "");
    const goBtn = this.el("button", "v-btn", this.screens.gameover, this.isTouch ? "ЗАНОВО" : "ЗАНОВО [R]");
    goBtn.addEventListener("click", () => this.cb.onRestart());
    const goCamp = this.el("button", "v-btn v-btn-dim", this.screens.gameover, "КАРТА КАМПАНИИ");
    goCamp.addEventListener("click", () => this.cb.onOpenCampaign());

    // ── victory ──
    this.screens.victory = this.el("div", "v-screen", this.root);
    this.el("div", "v-screen-h v-gold", this.screens.victory, "ОПЕРАЦИЯ ЗАВЕРШЕНА");
    this.vicStars = this.el("div", "v-stars", this.screens.victory, "");
    this.vicScore = this.el("div", "v-final-score", this.screens.victory, "");
    this.vicRelics = this.el("div", "v-relic-note", this.screens.victory, "");
    this.unlockVic = this.el("div", "v-unlock-note", this.screens.victory, "");
    this.vicNextBtn = this.el("button", "v-btn", this.screens.victory, "СЛЕДУЮЩАЯ ОПЕРАЦИЯ");
    this.vicNextBtn.addEventListener("click", () => this.cb.onNextLevel());
    const vicAgain = this.el("button", "v-btn v-btn-dim", this.screens.victory, this.isTouch ? "ЗАНОВО" : "ЗАНОВО [R]");
    vicAgain.addEventListener("click", () => this.cb.onRestart());
    const vicCamp = this.el("button", "v-btn v-btn-dim", this.screens.victory, "КАРТА КАМПАНИИ");
    vicCamp.addEventListener("click", () => this.cb.onOpenCampaign());

    this.showScreen(null);
    if (this.isTouch) document.body.classList.add("v-touch");
  }

  // ── title meta: rating + relics + boost shop ─────────────────────

  setTitleMeta(stars: number, relics: number): void {
    this.titleMeta.textContent = `★ РЕЙТИНГ ${stars}/${STAR_TOTAL} · ⚜ РЕЛИКТЫ ${relics}`;
  }

  /** Active timed boons — chips with countdown bars, rebuilt only when the set changes. */
  setBoosts(list: Array<{ icon: string; name: string; frac: number }>): void {
    const sig = list.map((b) => b.name).join("|");
    if (sig !== this.boostSig) {
      this.boostSig = sig;
      this.boostsRow.innerHTML = "";
      for (const b of list) {
        this.el("div", "v-aboost", this.boostsRow, `${b.icon} ${b.name}<i></i>`);
      }
    }
    const chips = this.boostsRow.children;
    for (let i = 0; i < list.length && i < chips.length; i++) {
      const bar = chips[i].querySelector("i") as HTMLElement | null;
      if (bar) bar.style.width = `${Math.max(0, Math.min(1, list[i].frac)) * 100}%`;
    }
  }

  /** A short centred flash of text — boon names, omens. */
  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove("v-toast-in");
    void this.toastEl.offsetWidth; // restart the CSS animation
    this.toastEl.classList.add("v-toast-in");
  }

  renderBoosts(armed: string[], relics: number): void {
    this.boostRow.innerHTML = "";
    this.el("div", "v-boost-cap", this.boostRow, "БЛАГОСЛОВЕНИЯ ПЕРЕД ВЫХОДОМ:");
    for (const b of BOOSTS) {
      const isArmed = armed.includes(b.id);
      const afford = relics >= b.price;
      const btn = document.createElement("button");
      btn.className = "v-boost" + (isArmed ? " v-boost-armed" : "") + (!isArmed && !afford ? " v-boost-poor" : "");
      btn.innerHTML = `${b.icon} ${b.name} — ${isArmed ? "ВЗЯТО" : `⚜${b.price}`}<span>${b.desc}</span>`;
      btn.addEventListener("click", () => this.cb.onToggleBoost(b.id));
      this.boostRow.appendChild(btn);
    }
  }

  // ── campaign grid ────────────────────────────────────────────────

  renderCampaign(diffId: string, starMap: Record<string, number[]>): void {
    this.campaignTabs.innerHTML = "";
    for (const d of DIFFICULTIES) {
      const total = starMap[d.id].reduce((a, b) => a + b, 0);
      const tab = document.createElement("button");
      tab.className = "v-camp-tab" + (d.id === diffId ? " v-camp-tab-sel" : "") +
        (d.id === "deadly" ? " v-camp-tab-deadly" : "");
      tab.textContent = `${d.name} · ★${total}`;
      tab.addEventListener("click", () => this.cb.onCampaignTab(d.id));
      this.campaignTabs.appendChild(tab);
    }
    this.campaignGrid.innerHTML = "";
    const arr = starMap[diffId];
    for (let i = 0; i < LEVELS_PER_TRACK; i++) {
      const unlocked = levelUnlocked(diffId, i, starMap);
      const stars = arr[i];
      const cell = document.createElement("button");
      cell.className = "v-camp-cell" +
        (unlocked ? "" : " v-camp-lock") +
        (stars > 0 ? " v-camp-done" : "");
      cell.innerHTML = unlocked
        ? `<b>${i + 1}</b><span>${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span>`
        : `<b>${i + 1}</b><span>🔒</span>`;
      if (unlocked) cell.addEventListener("click", () => this.cb.onSelectLevel(diffId, i));
      this.campaignGrid.appendChild(cell);
    }
    // the deadly track explains its price while it's still sealed
    if (diffId === "deadly") {
      const vet = starMap.veteran.reduce((a, b) => a + b, 0);
      if (vet < DEADLY_STAR_GATE) {
        const note = this.el("div", "v-camp-note", this.campaignGrid,
          `СМЕРТЕЛЬНАЯ сложность откроется после ★${DEADLY_STAR_GATE} на ветеране (сейчас ★${vet}). Каждая операция требует пройденного ветеранского аналога.`);
        note.style.gridColumn = "1 / -1";
      }
    }
  }

  // ── briefing ─────────────────────────────────────────────────────

  showBriefing(plan: LevelPlan, diff: DifficultyDef, stars: number): void {
    this.briefingBody.innerHTML = "";
    this.el("div", "v-brief-diff", this.briefingBody, `${diff.name} · ОПЕРАЦИЯ ${plan.index + 1}/${LEVELS_PER_TRACK}`);
    this.el("div", "v-screen-h", this.briefingBody, plan.name);
    this.el("div", "v-brief-ep", this.briefingBody, plan.epigraph.replace(/\n/g, "<br>"));
    this.el("div", "v-brief-boss", this.briefingBody,
      `8 карт · ФИНАЛ: ${plan.bossName}${stars > 0 ? ` · РЕКОРД: ${"★".repeat(stars)}` : ""}`);
    const go = this.el("button", "v-btn", this.briefingBody, "В БОЙ");
    go.addEventListener("click", () => this.cb.onBriefingStart());
    const back = this.el("button", "v-btn v-btn-dim", this.briefingBody, "НАЗАД");
    back.addEventListener("click", () => this.cb.onOpenCampaign());
    this.showScreen("briefing");
  }

  // ── hero roster ──────────────────────────────────────────────────

  /** Rebuild the hero roster cards. Locked heroes show stars or a relic price. */
  renderHeroes(defs: HeroDef[], ctx: HeroRenderCtx, selectedId: string, weaponsText: (h: HeroDef) => string): void {
    this.heroRow.innerHTML = "";
    for (const h of defs) {
      const unlocked = heroUnlocked(h, ctx.stars, ctx.purchased);
      const card = document.createElement("button");
      card.className = "v-hero-card" + (h.id === selectedId ? " v-hero-sel" : "");
      const armorPct = Math.round(h.armor * 100);
      card.innerHTML =
        `<div class="v-hero-name">${h.name}</div>` +
        `<div class="v-hero-pattern">${h.pattern}</div>` +
        `<div class="v-hero-stats">♥ ${h.hp} · ➤ ${Math.round(h.speedMul * 100)}%${armorPct ? ` · 🛡 ${armorPct}%` : ""}</div>` +
        `<div class="v-hero-weapons">${weaponsText(h)}</div>` +
        `<div class="v-hero-ult">☄ ${ULT_NAMES[h.ult]}</div>`;
      if (!unlocked) {
        const lock = document.createElement("div");
        lock.className = "v-hero-lock";
        const canBuy = h.price > 0 && ctx.relics >= h.price;
        lock.innerHTML =
          `<div class="v-hero-lock-icon">🔒</div>` +
          `<div>★ ${ctx.stars}/${h.stars}</div>` +
          (h.price > 0 ? `<div class="${canBuy ? "v-hero-price-yes" : ""}">⚜ ${h.price}</div>` : "");
        card.appendChild(lock);
      }
      card.addEventListener("click", () => this.cb.onSelectHero(h.id));
      this.heroRow.appendChild(card);
    }
  }

  /** "New hero earned" line on the end screens; empty string hides it. */
  setUnlockNote(text: string): void {
    this.unlockGo.textContent = text;
    this.unlockVic.textContent = text;
  }

  showScreen(name: "title" | "campaign" | "briefing" | "upgrade" | "paused" | "gameover" | "victory" | null): void {
    for (const k of Object.keys(this.screens)) {
      this.screens[k].style.display = k === name ? "flex" : "none";
    }
    this.heroRow.style.display = name === "title" ? "flex" : "none";
    const playing = name === null;
    this.topBar.style.display =
      name === "title" || name === "campaign" || name === "briefing" ? "none" : "flex";
    this.crosshair.style.display = playing && !this.isTouch ? "block" : "none";
    this.dashPip.style.display = playing && !this.isTouch ? "block" : "none";
    this.ultPip.style.display = playing && !this.isTouch ? "block" : "none";
    this.dashBtn.style.visibility = playing ? "visible" : "hidden";
    this.meleeBtn.style.visibility = playing ? "visible" : "hidden";
    this.ultBtn.style.visibility = playing ? "visible" : "hidden";
    this.weaponText.style.display = playing ? "block" : "none";
  }

  showUpgrades(options: Upgrade[]): void {
    this.upgradeCards.innerHTML = "";
    options.forEach((u, i) => {
      const card = document.createElement("button");
      card.className = "v-card";
      card.innerHTML =
        `<div class="v-card-key">${i + 1}</div>` +
        `<div class="v-card-icon">${u.icon}</div>` +
        `<div class="v-card-name">${u.name}</div>` +
        `<div class="v-card-desc">${u.desc}</div>`;
      card.addEventListener("click", () => this.cb.onPickUpgrade(i));
      this.upgradeCards.appendChild(card);
    });
    this.showScreen("upgrade");
  }

  setHp(cur: number, max: number): void {
    const f = Math.max(0, cur / max);
    this.hpFill.style.width = `${f * 100}%`;
    this.hpFill.classList.toggle("v-hp-low", f < 0.3);
    this.hpText.textContent = `${Math.max(0, Math.ceil(cur))}`;
  }

  setWave(levelName: string, w: number, total: number, left: number): void {
    this.waveText.textContent = w > 0
      ? `${levelName} · КАРТА ${w}/${total} · ВРАГОВ: ${left}`
      : "";
  }

  setScore(score: number, best: number): void {
    this.scoreText.textContent = `СЧЁТ ${score}`;
    this.bestText.textContent = best > 0 ? `РЕКОРД ${best}` : "";
  }

  setBossName(name: string): void {
    this.bossLabel.textContent = name;
  }

  setBoss(hpFrac: number | null): void {
    if (hpFrac === null) {
      this.bossBar.style.display = "none";
    } else {
      this.bossBar.style.display = "block";
      this.bossFill.style.width = `${Math.max(0, hpFrac) * 100}%`;
    }
  }

  setDash(frac: number): void {
    if (frac >= 1) {
      this.dashPip.textContent = "РЫВОК ✓";
      this.dashPip.classList.add("v-dash-ready");
    } else {
      this.dashPip.textContent = "РЫВОК …";
      this.dashPip.classList.remove("v-dash-ready");
    }
    this.dashBtn.classList.toggle("v-dashbtn-cd", frac < 1);
    this.dashBtn.style.opacity = frac >= 1 ? "1" : "0.45";
  }

  /** Ultimate charge: pip text (desktop) + touch button glow. */
  setUlt(frac: number, name: string): void {
    const label = name.toUpperCase();
    if (frac >= 1) {
      this.ultPip.textContent = `${label} ✓`;
      this.ultPip.classList.add("v-dash-ready");
    } else {
      this.ultPip.textContent = `${label} ${Math.floor(frac * 100)}%`;
      this.ultPip.classList.remove("v-dash-ready");
    }
    this.ultBtn.style.opacity = frac >= 1 ? "1" : "0.45";
    this.ultBtn.classList.toggle("v-dashbtn-cd", frac < 1);
  }

  setWeapons(rangedName: string, meleeName: string): void {
    this.weaponText.textContent = `${rangedName} · ${meleeName}`;
  }

  setMeleeCd(frac: number): void {
    this.meleeBtn.style.opacity = frac >= 1 ? "1" : "0.45";
    this.meleeBtn.classList.toggle("v-dashbtn-cd", frac < 1);
  }

  flashDamage(): void {
    this.vignette.classList.remove("v-flash");
    // force reflow so the animation restarts
    void this.vignette.offsetWidth;
    this.vignette.classList.add("v-flash");
  }

  setMute(muted: boolean): void {
    this.muteBtn.textContent = muted ? "✕" : "♪";
    this.muteBtn.classList.toggle("v-muted", muted);
  }

  setGameOver(score: number, relicsEarned: number): void {
    this.goScore.textContent = `СЧЁТ: ${score}`;
    this.goRelics.textContent = relicsEarned > 0 ? `⚜ +${relicsEarned} реликтов` : "";
  }

  setVictory(score: number, stars: number, relicsEarned: number, hasNext: boolean): void {
    this.vicStars.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    this.vicScore.textContent = `СЧЁТ: ${score}`;
    this.vicRelics.textContent = `⚜ +${relicsEarned} реликтов`;
    this.vicNextBtn.style.display = hasNext ? "" : "none";
  }

  moveCrosshair(x: number, y: number): void {
    this.crosshair.style.transform = `translate(${x - 11}px, ${y - 11}px)`;
  }

  /** Position a virtual stick visual; null hides it. */
  setStick(side: "L" | "R", x: number, y: number, dx: number, dy: number, active: boolean): void {
    const stick = side === "L" ? this.stickL : this.stickR;
    const knob = side === "L" ? this.stickLKnob : this.stickRKnob;
    if (!active) {
      stick.style.display = "none";
      return;
    }
    stick.style.display = "block";
    stick.style.left = `${x - 60}px`;
    stick.style.top = `${y - 60}px`;
    knob.style.transform = `translate(${dx * 32}px, ${dy * 32}px)`;
  }
}

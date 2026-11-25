/**
 * game.ts — the orchestrator. States: title → campaign → briefing → playing ⇄ paused →
 * upgrade → … → victory | gameover. A run is one campaign level: 8 maps (waves),
 * the last one guarded by the faction boss.
 * Camera: high-angle top-down looking north, so W = -z (forward), D = +x (right) — matching
 * the direction assertions in scripts/verify-game.mjs.
 */

import * as THREE from "three";
import { GameLoop } from "./engine";
import { Input } from "./input";
import { AudioSystem } from "./audio";
import { highScore } from "./storage";
import { World, pushOutObstacles, insideObstacle } from "./world";
import { Particles } from "./particles";
import { Bullets } from "./bullets";
import { EnemyPool, isBoss, type Enemy, type EnemyKind, type ProjKind } from "./enemies";
import { buildPlayerModel, type PlayerModel } from "./player";
import { baseStats, rollUpgrades, type Stats, type Upgrade } from "./upgrades";
import { rangedById, meleeById, RANGED_WEAPONS, MELEE_WEAPONS } from "./weapons";
import { HEROES, heroById, heroUnlocked, selectedHero, ULT_NAMES, type HeroDef } from "./heroes";
import {
  buildLevel, waveScaling, DIFFICULTIES, WAVES_PER_LEVEL, LEVELS_PER_TRACK,
  type DifficultyDef, type LevelPlan,
} from "./levels";
import {
  relicsStore, starsStore, purchasedStore, boostStore, firstUncleared,
} from "./shop";
import { Hud } from "./hud";
import { PLAYER, ARENA, WAVES, QUALITY } from "./config";

type State = "title" | "campaign" | "briefing" | "playing" | "upgrade" | "paused" | "gameover" | "victory";

/** Everything that can lie on the battlefield waiting to be picked up. */
type PickupKind = "heal" | "ranged" | "melee" | "magnet" | "shield" | "doubledmg" | "purge" | "fury";

interface BoostPickupDef {
  kind: PickupKind;
  name: string;
  icon: string;
  color: number;
  /** Drop weight in the random roll. */
  weight: number;
  /** Seconds for timed boons (0 = instant). */
  duration: number;
}

/** Battlefield boons — random drops that turn a bad wave around. */
const BOOST_PICKUPS: BoostPickupDef[] = [
  { kind: "magnet", name: "Серво-захват", icon: "🧲", color: 0xc06aff, weight: 0.22, duration: 25 },
  { kind: "shield", name: "Железный ореол", icon: "🛡", color: 0x5aa8ff, weight: 0.20, duration: 10 },
  { kind: "doubledmg", name: "Клятва ярости", icon: "⚔", color: 0xff4433, weight: 0.22, duration: 15 },
  { kind: "fury", name: "Боевой транс", icon: "☄", color: 0xff9a3d, weight: 0.20, duration: 0 },
  { kind: "purge", name: "Гнев Императора", icon: "✠", color: 0xfff2c0, weight: 0.16, duration: 0 },
];
const boostDef = (kind: PickupKind): BoostPickupDef => BOOST_PICKUPS.find((b) => b.kind === kind)!;
const isBoostKind = (kind: PickupKind): boolean => kind !== "heal" && kind !== "ranged" && kind !== "melee";

const CAM_OFF = new THREE.Vector3(0, 25, 12.5);

export class Game {
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private world: World;
  private particles: Particles;
  private bullets: Bullets;
  private enemies: EnemyPool;
  private player: PlayerModel;
  private hud: Hud;
  private audio: AudioSystem;
  private input: Input;
  private loop: GameLoop;

  private state: State = "title";
  private t = 0;
  private wave = 0;
  private queue: EnemyKind[] = [];
  private spawnTimer = 0;
  private spawnInterval: number = WAVES.SPAWN_INTERVAL;
  private score = 0;
  private best: number;

  private hp: number = PLAYER.MAX_HP;
  private maxHp: number = PLAYER.MAX_HP;
  private stats: Stats = baseStats();
  private offers: Upgrade[] = [];

  private fireTimer = 0;
  private dashT = 0;
  private dashCdT = 0;
  private dashDirX = 0;
  private dashDirZ = 1;
  private invulnT = 0;
  private rangedId = "bolter";
  private meleeId = "knife";
  private meleeCdT = 0;
  private meleeQueued = false;
  private whisperActive = false;
  private aimX = 0;
  private aimZ = -1;
  private shake = 0;

  // ultimate: charge 0..100, plus delayed strikes for the orbital lance
  private ultCharge = 0;
  private pendingBlasts: Array<{ t: number; x: number; z: number; r: number; dmg: number }> = [];
  private touchUltQueued = false;

  private hero: HeroDef;
  private playerRadius: number = PLAYER.RADIUS;

  // campaign session
  private plan: LevelPlan;
  private diff: DifficultyDef = DIFFICULTIES[0];
  private campaignDiff: string = DIFFICULTIES[0].id;
  private currentLevel = 0;

  private mouse = { x: 0, y: 0, down: false };
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
  private aimPoint = new THREE.Vector3();
  private ndc = new THREE.Vector2();
  private tmpV = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private camDistMul = 1;

  private muzzleLight: THREE.PointLight;
  private heroLight!: THREE.PointLight;
  private pickups: Array<{ mesh: THREE.Mesh; active: boolean; kind: PickupKind; heal: number; weaponId: string }> = [];
  private pickupGeos!: Record<PickupKind, THREE.BufferGeometry>;
  private pickupMats!: Record<PickupKind, THREE.Material>;
  private sparkleT = 0;

  // timed pickup boons
  private boostT = { magnet: 0, shield: 0, doubledmg: 0 };
  private shieldBubble!: THREE.Mesh;

  // reusable one-shot FX: expanding ground rings + sky lance beams
  private fxRings: Array<{ mesh: THREE.Mesh; t: number; dur: number; maxR: number }> = [];
  private fxBeams: Array<{ mesh: THREE.Mesh; t: number; dur: number }> = [];

  // mobile sticks
  private moveTouch: { id: number; ox: number; oy: number } | null = null;
  private aimTouch: { id: number; ox: number; oy: number; cx: number; cy: number } | null = null;
  private touchDashQueued = false;

  // perf auto-degrade
  private fpsAcc = 0;
  private fpsN = 0;
  private lowFpsT = 0;
  private degraded = false;

  private unsub: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.world = new World();
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.copy(CAM_OFF);
    this.camera.lookAt(0, 0, 0);

    this.particles = new Particles(this.world.scene, QUALITY.PARTICLES_HIGH);
    this.bullets = new Bullets(this.world.scene);
    this.enemies = new EnemyPool(this.world.scene);
    this.player = buildPlayerModel();
    this.player.group.position.set(0, 0, 4);
    this.world.scene.add(this.player.group);

    this.muzzleLight = new THREE.PointLight(0xffc060, 0, 9, 2);
    this.world.scene.add(this.muzzleLight);

    // hero light — keeps the last Marine readable in the gloom
    this.heroLight = new THREE.PointLight(0xffe0b0, 14, 12, 1.6);
    this.heroLight.position.set(0, 5, 4);
    this.world.scene.add(this.heroLight);

    // pickups: medicae stims, weapon drops and battlefield boons — one pool,
    // each kind with its own silhouette so the field reads at a glance
    this.pickupGeos = {
      heal: new THREE.OctahedronGeometry(0.32),
      ranged: new THREE.OctahedronGeometry(0.32),
      melee: new THREE.OctahedronGeometry(0.32),
      magnet: new THREE.TorusGeometry(0.28, 0.11, 8, 18),
      shield: new THREE.IcosahedronGeometry(0.36),
      doubledmg: new THREE.TetrahedronGeometry(0.44),
      fury: new THREE.BoxGeometry(0.42, 0.42, 0.42),
      purge: new THREE.OctahedronGeometry(0.46),
    };
    this.pickupMats = {
      heal: new THREE.MeshBasicMaterial({ color: 0x59ff8a }),
      ranged: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      melee: new THREE.MeshBasicMaterial({ color: 0x7df0ff }),
      magnet: new THREE.MeshBasicMaterial({ color: boostDef("magnet").color }),
      shield: new THREE.MeshBasicMaterial({ color: boostDef("shield").color }),
      doubledmg: new THREE.MeshBasicMaterial({ color: boostDef("doubledmg").color }),
      fury: new THREE.MeshBasicMaterial({ color: boostDef("fury").color }),
      purge: new THREE.MeshBasicMaterial({ color: boostDef("purge").color }),
    };
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(this.pickupGeos.heal, this.pickupMats.heal);
      mesh.visible = false;
      this.world.scene.add(mesh);
      this.pickups.push({ mesh, active: false, kind: "heal", heal: 22, weaponId: "" });
    }

    // iron halo — the shield boon's bubble, hidden until invoked
    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 18, 12),
      new THREE.MeshBasicMaterial({
        color: 0x5aa8ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    this.shieldBubble.position.y = 1.0;
    this.shieldBubble.visible = false;
    // scene-level, not a child of the hero: applyHeroModel() rebuilds the figure
    this.world.scene.add(this.shieldBubble);

    // ground shockwave rings (nova, purge, boon activations)
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.12;
      mesh.visible = false;
      this.world.scene.add(mesh);
      this.fxRings.push({ mesh, t: 0, dur: 0, maxR: 1 });
    }
    // sky lance beams (orbital strikes)
    const beamGeo = new THREE.CylinderGeometry(0.3, 0.6, 30, 8, 1, true);
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xffe9b0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.position.y = 15;
      mesh.visible = false;
      this.world.scene.add(mesh);
      this.fxBeams.push({ mesh, t: 0, dur: 0 });
    }
    this.bullets.onExpire = (b) => {
      if (b.aoe > 0 && b.friendly) this.explode(b.mesh.position.x, b.mesh.position.z, b.aoe, b.dmg);
    };
    this.enemies.onRevive = (x, z) => {
      this.particles.burst(x, 1, z, 26, 0x59ff8a, 7, 0.8, 6);
      this.audio.sfx("charge");
    };

    this.input = new Input(canvas);
    this.audio = new AudioSystem();
    this.best = highScore.get();
    this.hero = heroById(selectedHero.get());
    if (!heroUnlocked(this.hero, starsStore.total(), purchasedStore.get())) this.hero = HEROES[0];
    this.plan = buildLevel(0, this.diff);
    this.hud = new Hud(overlay, {
      onStart: () => this.quickStart(),
      onRestart: () => this.startRun(),
      onResume: () => this.togglePause(),
      onPickUpgrade: (i) => this.pickUpgrade(i),
      onToggleMute: () => this.hud.setMute(this.audio.toggleMute()),
      onDash: () => { this.touchDashQueued = true; },
      onMelee: () => { this.meleeQueued = true; },
      onUlt: () => { this.touchUltQueued = true; },
      onPause: () => this.togglePause(),
      onSelectHero: (id) => this.selectHero(id),
      onOpenCampaign: () => this.showCampaign(),
      onCampaignTab: (diffId) => {
        this.campaignDiff = diffId;
        this.hud.renderCampaign(diffId, starsStore.get());
      },
      onSelectLevel: (diffId, index) => this.openBriefing(diffId, index),
      onBriefingStart: () => this.startRun(),
      onBackToTitle: () => this.backToTitle(),
      onNextLevel: () => this.openBriefing(this.diff.id, this.currentLevel + 1),
      onToggleBoost: (id) => {
        boostStore.toggle(id);
        this.refreshMeta();
      },
    });
    this.hud.setMute(this.audio.muted);
    this.hud.setWeapons(rangedById(this.rangedId).name, meleeById(this.meleeId).name);
    this.refreshMeta();
    this.hud.showScreen("title");
    this.audio.startChoir();
    document.body.classList.add("v-state-title");

    this.bindInput(canvas);
    this.onResize();

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: () => this.render(),
    });
    this.loop.start();
  }

  // ── input binding ────────────────────────────────────────────────

  private on<K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: HTMLElement | Window = window): void {
    const h = fn as EventListener;
    target.addEventListener(type, h);
    this.unsub.push(() => target.removeEventListener(type, h));
  }

  private bindInput(canvas: HTMLCanvasElement): void {
    this.on("mousemove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.hud.moveCrosshair(e.clientX, e.clientY);
    });
    this.on("mousedown", (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.meleeQueued = true;
    });
    this.on("mouseup", (e) => { if (e.button === 0) this.mouse.down = false; });
    this.on("contextmenu", (e) => e.preventDefault(), canvas);

    // mobile twin sticks (values for movement come from Input's own left-stick
    // handling; here we track both sticks for visuals + the aim/fire stick logic)
    this.on("touchstart", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth / 2 && !this.moveTouch) {
          this.moveTouch = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        } else if (t.clientX >= window.innerWidth / 2 && !this.aimTouch) {
          this.aimTouch = { id: t.identifier, ox: t.clientX, oy: t.clientY, cx: t.clientX, cy: t.clientY };
        }
      }
    }, canvas);
    this.on("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          this.hud.setStick("L", this.moveTouch.ox, this.moveTouch.oy,
            (t.clientX - this.moveTouch.ox) / 60, (t.clientY - this.moveTouch.oy) / 60, true);
        } else if (this.aimTouch && t.identifier === this.aimTouch.id) {
          this.aimTouch.cx = t.clientX;
          this.aimTouch.cy = t.clientY;
          this.hud.setStick("R", this.aimTouch.ox, this.aimTouch.oy,
            (t.clientX - this.aimTouch.ox) / 60, (t.clientY - this.aimTouch.oy) / 60, true);
        }
      }
    }, canvas);
    const touchEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (this.moveTouch && t.identifier === this.moveTouch.id) {
          this.moveTouch = null;
          this.hud.setStick("L", 0, 0, 0, 0, false);
        } else if (this.aimTouch && t.identifier === this.aimTouch.id) {
          this.aimTouch = null;
          this.hud.setStick("R", 0, 0, 0, 0, false);
        }
      }
    };
    this.on("touchend", touchEnd, canvas);
    this.on("touchcancel", touchEnd, canvas);

    this.on("resize", () => this.onResize());
  }

  private onResize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    // portrait phones need the camera further back to see the arena
    this.camDistMul = this.camera.aspect < 1 ? Math.min(2.2, 1.15 / this.camera.aspect) : 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // ── meta screens (title / campaign / briefing) ───────────────────

  private refreshMeta(): void {
    this.hud.setTitleMeta(starsStore.total(), relicsStore.get());
    this.hud.renderBoosts(boostStore.getArmed(), relicsStore.get());
    this.refreshHeroRoster();
  }

  private refreshHeroRoster(): void {
    this.hud.renderHeroes(HEROES, {
      stars: starsStore.total(),
      purchased: purchasedStore.get(),
      relics: relicsStore.get(),
    }, this.hero.id, (h) => `${rangedById(h.ranged).name} · ${meleeById(h.melee).name}`);
  }

  private selectHero(id: string): void {
    const h = heroById(id);
    const unlocked = heroUnlocked(h, starsStore.total(), purchasedStore.get());
    if (!unlocked) {
      // the relic shortcut: locked but purchasable
      if (h.price > 0 && relicsStore.spend(h.price)) {
        purchasedStore.add(h.id);
        this.hud.setUnlockNote(`НОВЫЙ ЗАЩИТНИК: ${h.name.toUpperCase()}`);
      } else {
        this.audio.sfx("ui");
        return;
      }
    }
    this.hero = h;
    selectedHero.set(h.id);
    this.audio.sfx("upgrade");
    this.refreshMeta();
    // show the chosen defender on the title stage right away
    this.applyHeroModel();
  }

  private showCampaign(): void {
    if (this.whisperActive) { this.whisperActive = false; this.audio.stopWhisper(); }
    this.audio.stopMusic();
    this.audio.startChoir();
    this.enemies.clear();
    this.bullets.clear();
    this.hud.renderCampaign(this.campaignDiff, starsStore.get());
    this.setState("campaign");
    this.hud.showScreen("campaign");
  }

  private openBriefing(diffId: string, index: number): void {
    if (index >= LEVELS_PER_TRACK) {
      this.showCampaign();
      return;
    }
    this.diff = DIFFICULTIES.find((d) => d.id === diffId) ?? DIFFICULTIES[0];
    this.campaignDiff = this.diff.id;
    this.currentLevel = index;
    this.plan = buildLevel(index, this.diff);
    this.setState("briefing");
    this.hud.showBriefing(this.plan, this.diff, starsStore.get()[this.diff.id][index]);
  }

  private quickStart(): void {
    // one press = straight into the fight at the campaign's edge
    this.diff = DIFFICULTIES[0];
    this.campaignDiff = this.diff.id;
    this.currentLevel = firstUncleared("recruit", starsStore.get());
    this.plan = buildLevel(this.currentLevel, this.diff);
    this.startRun();
  }

  private backToTitle(): void {
    if (this.whisperActive) { this.whisperActive = false; this.audio.stopWhisper(); }
    this.audio.stopMusic();
    this.audio.startChoir();
    this.enemies.clear();
    this.bullets.clear();
    for (const p of this.pickups) { p.active = false; p.mesh.visible = false; }
    this.boostT = { magnet: 0, shield: 0, doubledmg: 0 };
    this.shieldBubble.visible = false;
    this.hud.setBoosts([]);
    this.player.group.visible = true;
    this.hud.setBoss(null);
    this.refreshMeta();
    this.setState("title");
    this.hud.showScreen("title");
  }

  // ── hero roster ──────────────────────────────────────────────────

  /** (Re)build the player figure for the current hero — title stage and run start. */
  private applyHeroModel(): void {
    const pos = this.player.group.position.clone();
    this.player.group.removeFromParent();
    this.player.dispose();
    this.player = buildPlayerModel({
      tint: this.hero.tint, trim: this.hero.trim, scale: this.hero.scale, model: this.hero.model,
    });
    this.player.group.position.copy(pos);
    this.world.scene.add(this.player.group);
    this.playerRadius = PLAYER.RADIUS * (0.7 + 0.3 * this.hero.scale);
  }

  // ── state changes ────────────────────────────────────────────────

  private setState(s: State): void {
    this.state = s;
    document.body.className = document.body.className.replace(/v-state-\w+/g, "").trim();
    document.body.classList.add(`v-state-${s}`);
    if (this.hud.isTouch) document.body.classList.add("v-touch");
  }

  private startRun(): void {
    this.stats = baseStats();
    this.applyHeroModel();
    this.maxHp = this.hero.hp;
    this.hp = this.maxHp;
    this.score = 0;
    this.wave = 0;
    this.queue = [];
    this.fireTimer = 0;
    this.dashT = 0;
    this.dashCdT = 0;
    this.invulnT = 0;
    this.rangedId = this.hero.ranged;
    this.meleeId = this.hero.melee;
    this.meleeCdT = 0;
    this.meleeQueued = false;
    this.ultCharge = 0;
    this.pendingBlasts = [];
    this.touchUltQueued = false;
    this.boostT = { magnet: 0, shield: 0, doubledmg: 0 };
    this.shieldBubble.visible = false;
    this.hud.setBoosts([]);
    this.spawnInterval = WAVES.SPAWN_INTERVAL * this.diff.spawnMul;
    // armed boosts apply once and are consumed
    const armed = boostStore.consume();
    if (armed.includes("aegis")) this.maxHp = Math.round(this.maxHp * 1.25);
    if (armed.includes("litany")) this.stats.damageMul *= 1.15;
    if (armed.includes("focus")) this.ultCharge = 50;
    this.hp = this.maxHp;
    this.hud.setUnlockNote("");
    if (this.whisperActive) { this.whisperActive = false; this.audio.stopWhisper(); }
    this.enemies.clear();
    this.bullets.clear();
    for (const p of this.pickups) { p.active = false; p.mesh.visible = false; }
    this.player.group.visible = true;
    this.player.group.position.set(0, 0, 4);
    this.hud.setBoss(null);
    this.hud.setWeapons(rangedById(this.rangedId).name, meleeById(this.meleeId).name);
    this.hud.showScreen(null);
    this.setState("playing");
    this.audio.stopChoir();
    this.audio.startMusic();
    this.startWave(1);
  }

  private startWave(w: number): void {
    this.wave = w;
    const wp = this.plan.waves[w - 1];
    this.queue = [...wp.roster];
    this.spawnTimer = 1.0;
    this.world.setBiome(wp.biome);
    this.world.setLayout(wp.layout);
    this.enemies.setObstacles(this.world.obstacles);
    this.hud.setBossName(this.plan.bossName);
    this.audio.sfx("wave");
    this.audio.setIntensity(w / WAVES_PER_LEVEL);
  }

  private pickUpgrade(i: number): void {
    const u = this.offers[i];
    if (!u || this.state !== "upgrade") return;
    u.apply(this.stats);
    if (u.id === "hp") {
      this.maxHp = this.hero.hp + this.stats.maxHpBonus;
      this.hp = this.maxHp;
    }
    if (u.weaponRanged) this.rangedId = u.weaponRanged;
    if (u.weaponMelee) this.meleeId = u.weaponMelee;
    if (u.weaponRanged || u.weaponMelee) {
      this.hud.setWeapons(rangedById(this.rangedId).name, meleeById(this.meleeId).name);
    }
    this.audio.sfx("upgrade");
    this.hud.showScreen(null);
    this.setState("playing");
    this.startWave(this.wave + 1);
  }

  private togglePause(): void {
    if (this.state === "playing") {
      this.setState("paused");
      this.hud.showScreen("paused");
    } else if (this.state === "paused") {
      this.setState("playing");
      this.hud.showScreen(null);
    }
  }

  private endRun(victory: boolean): void {
    if (this.score > this.best) {
      this.best = this.score;
      highScore.set(this.best);
    }
    // rating: 1 star for the clear, +1 at ≥50% integrity, +1 at ≥85%
    const hpFrac = Math.max(0, this.hp / this.maxHp);
    const stars = victory ? 1 + (hpFrac >= 0.5 ? 1 : 0) + (hpFrac >= 0.85 ? 1 : 0) : 0;
    const starsBefore = starsStore.total();
    if (victory) starsStore.record(this.diff.id, this.currentLevel, stars);
    const starsAfter = starsStore.total();
    // relics: the purse grows with blood and with the operation's depth
    const relicsEarned = victory
      ? Math.floor(this.score / 30) + 40 + this.currentLevel * 2 + stars * 20
      : Math.floor(this.score / 40);
    if (relicsEarned > 0) relicsStore.add(relicsEarned);
    // heroes whose star threshold just fell
    const purchased = purchasedStore.get();
    const newly = HEROES.filter((h) =>
      h.stars > starsBefore && h.stars <= starsAfter && !purchased.includes(h.id));
    if (newly.length > 0) {
      this.hud.setUnlockNote(`НОВЫЙ ЗАЩИТНИК: ${newly.map((h) => h.name.toUpperCase()).join(" · ")}`);
    }
    this.hud.setBoss(null);
    if (this.whisperActive) { this.whisperActive = false; this.audio.stopWhisper(); }
    if (victory) {
      this.audio.sfx("win");
      this.audio.stopMusic();
      this.audio.startChoir();
      this.hud.setVictory(this.score, stars, relicsEarned,
        this.currentLevel + 1 < LEVELS_PER_TRACK);
      this.setState("victory");
      this.hud.showScreen("victory");
    } else {
      this.audio.sfx("lose");
      this.audio.stopMusic();
      this.hud.setGameOver(this.score, relicsEarned);
      this.setState("gameover");
      this.hud.showScreen("gameover");
      // the Vigil Marine falls — dramatic burst
      const p = this.player.group.position;
      this.particles.burst(p.x, 1.2, p.z, 60, 0xffd27a, 8, 1.2, 12);
      this.particles.burst(p.x, 1.2, p.z, 40, 0x8a1f1f, 6, 1.0, 10);
      this.player.group.visible = false;
    }
  }

  // ── combat ───────────────────────────────────────────────────────

  private damagePlayer(dmg: number): void {
    if (this.invulnT > 0 || this.dashT > 0 || this.state !== "playing") return;
    // the iron halo turns the blow aside without a scratch
    if (this.boostT.shield > 0) {
      const p = this.player.group.position;
      this.particles.burst(p.x, 1.2, p.z, 10, 0x5aa8ff, 4, 0.35, 4);
      this.audio.sfx("enemyHit");
      (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = 0.4;
      return;
    }
    this.hp -= Math.max(1, Math.round(dmg * (1 - this.hero.armor)));
    this.invulnT = PLAYER.HIT_INVULN;
    this.hud.flashDamage();
    this.audio.sfx("playerHurt");
    this.shake = Math.min(1, this.shake + 0.45);
    const p = this.player.group.position;
    this.particles.burst(p.x, 1.2, p.z, 14, 0x8a1f1f, 5, 0.6, 9);
    if (this.hp <= 0) this.endRun(false);
  }

  private fireWeapon(): void {
    const w = rangedById(this.rangedId);
    this.player.group.updateMatrixWorld();
    const muzzle = this.player.getMuzzle(this.tmpV);
    const baseA = Math.atan2(this.aimX, this.aimZ);
    const pellets = w.pellets + (this.stats.multishot - 1);
    const dmg = w.damage * this.stats.damageMul * (this.boostT.doubledmg > 0 ? 2 : 1);
    const pierce = w.pierce + this.stats.pierce;
    for (let par = 0; par <= w.parallel; par++) {
      // twin-linked barrels fire side-by-side at the same angle
      const off = w.parallel > 0 ? (par === 0 ? -0.24 : 0.24) : 0;
      const ox = muzzle.x + Math.cos(baseA) * off;
      const oz = muzzle.z - Math.sin(baseA) * off;
      for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? (i - (pellets - 1) / 2) * (w.spread || 0.1) : 0;
        const a = baseA + spread + (Math.random() - 0.5) * 0.015;
        this.bullets.fire(true, ox, oz, Math.sin(a), Math.cos(a),
          w.speed, dmg, w.life, pierce,
          { aoe: w.aoe, mat: w.mat, scale: w.scale, radius: w.aoe > 0 ? 0.5 : 0.3 });
      }
    }
    this.muzzleLight.position.set(muzzle.x, 1.4, muzzle.z);
    this.muzzleLight.color.setHex(w.mat === "plasma" ? 0x86f4ff : w.mat === "melta" ? 0xff9540 : 0xffc060);
    this.muzzleLight.intensity = w.aoe > 0 ? 34 : 22;
    this.particles.burst(muzzle.x, 1.2, muzzle.z, 3, w.mat === "plasma" ? 0x86f4ff : w.mat === "melta" ? 0xff9540 : 0xffd27a, 4, 0.18, 2, 0.2);
    this.audio.sfx(w.sfx);
    this.shake = Math.min(1, this.shake + (w.aoe > 0 ? 0.12 : w.id.includes("melta") ? 0.1 : 0.045));
  }

  /** Ultimate charge gain — the Librarius conduit fills faster. */
  private addUlt(n: number): void {
    this.ultCharge = Math.min(100, this.ultCharge + n * (this.hero.passive?.ultMul ?? 1));
  }

  /** The hero's ultimate: orbital lance barrage, exterminatus nova, or krak rocket fan. */
  private fireUlt(): void {
    const p = this.player.group.position;
    this.audio.sfx("bossRoar");
    this.shake = 1;
    if (this.hero.ult === "nova") {
      // EXTERMINATUS — a ring of holy fire that does not distinguish
      this.audio.sfx("boom");
      this.muzzleLight.position.set(p.x, 2, p.z);
      this.muzzleLight.color.setHex(0xffb54a);
      this.muzzleLight.intensity = 60;
      this.spawnRing(p.x, p.z, 0xffb54a, 11, 0.55);
      this.spawnRing(p.x, p.z, 0xff6a3a, 9, 0.75);
      this.spawnRing(p.x, p.z, 0xffffff, 4, 0.35);
      this.particles.burst(p.x, 1, p.z, 90, 0xffb54a, 15, 1.1, 13);
      this.particles.burst(p.x, 1, p.z, 60, 0xff6a3a, 11, 0.9, 11);
      this.particles.burst(p.x, 1, p.z, 40, 0xffffff, 8, 0.5, 8);
      for (const e of this.enemies.list) {
        if (!e.active) continue;
        const d = Math.hypot(e.mesh.position.x - p.x, e.mesh.position.z - p.z);
        if (d > 10 + e.radius) continue;
        const falloff = 1 - (d / (10 + e.radius)) * 0.6;
        e.hp -= (isBoss(e.kind) ? 300 : 130) * falloff;
        e.flashT = 0.25;
        this.particles.burst(e.mesh.position.x, 1, e.mesh.position.z, 8, 0xff6a3a, 6, 0.6, 10);
        if (e.hp <= 0) this.killEnemy(e);
      }
    } else if (this.hero.ult === "orbital") {
      // ORBITAL LANCE — the fleet answers; strikes walk the target point
      const tx = Math.max(-ARENA.HALF_W, Math.min(ARENA.HALF_W, p.x + this.aimX * 7));
      const tz = Math.max(-ARENA.HALF_D, Math.min(ARENA.HALF_D, p.z + this.aimZ * 7));
      // target-designator ring so the player reads where the sky will fall
      this.spawnRing(tx, tz, 0x86f4ff, 4.4, 1.0);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        this.pendingBlasts.push({
          t: 0.15 * i,
          x: tx + Math.cos(a) * 2.2,
          z: tz + Math.sin(a) * 2.2,
          r: 3.2,
          dmg: 95,
        });
      }
    } else {
      // ROCKET SALVO — a fan of krak missiles down the aim line
      const baseA = Math.atan2(this.aimX, this.aimZ);
      this.spawnRing(p.x, p.z, 0xff9540, 3, 0.3);
      for (let i = 0; i < 8; i++) {
        const a = baseA + (i - 3.5) * 0.13;
        this.bullets.fire(true, p.x, p.z, Math.sin(a), Math.cos(a), 26, 70, 1.6, 0,
          { aoe: 2.4, mat: "melta", scale: [1.3, 1.3, 2.6], radius: 0.5 });
      }
      this.audio.sfx("meltaShot");
    }
  }

  /** Explosion helper: plasma bursts and the power fist's shockwave. */
  private explode(x: number, z: number, radius: number, dmg: number): void {
    this.audio.sfx("boom");
    this.shake = Math.min(1, this.shake + 0.3);
    this.muzzleLight.position.set(x, 1.5, z);
    this.muzzleLight.color.setHex(0x86f4ff);
    this.muzzleLight.intensity = 40;
    this.particles.burst(x, 1, z, 30, 0x86f4ff, 9, 0.6, 8);
    this.particles.burst(x, 1, z, 18, 0xffffff, 6, 0.35, 6);
    for (const e of this.enemies.list) {
      if (!e.active) continue;
      const dx = e.mesh.position.x - x, dz = e.mesh.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > radius + e.radius) continue;
      const falloff = 1 - (d / (radius + e.radius)) * 0.5;
      e.hp -= dmg * falloff;
      e.flashT = 0.15;
      this.particles.burst(e.mesh.position.x, 1, e.mesh.position.z, 6, 0x8a1f1f, 5, 0.5, 9);
      if (e.hp <= 0) this.killEnemy(e);
    }
  }

  private swingMelee(): void {
    const w = meleeById(this.meleeId);
    this.meleeCdT = w.cooldown;
    const p = this.player.group.position;
    const aimA = Math.atan2(this.aimX, this.aimZ);
    let hit = false;
    for (const e of this.enemies.list) {
      if (!e.active) continue;
      const dx = e.mesh.position.x - p.x;
      const dz = e.mesh.position.z - p.z;
      const d = Math.hypot(dx, dz) || 0.0001;
      if (d > w.range + e.radius) continue;
      let da = Math.atan2(dx, dz) - aimA;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > w.arc / 2) continue;
      hit = true;
      e.hp -= w.damage * this.stats.damageMul * (this.hero.passive?.meleeMul ?? 1) * (this.boostT.doubledmg > 0 ? 2 : 1);
      e.flashT = 0.15;
      e.attackCd += 0.35; // stagger — a swung blade buys breathing room
      e.mesh.position.x += (dx / d) * w.knockback * 0.4;
      e.mesh.position.z += (dz / d) * w.knockback * 0.4;
      this.particles.burst(e.mesh.position.x, 1.2, e.mesh.position.z, 10, 0x8a1f1f, 6, 0.5, 9);
      this.audio.sfx("enemyHit");
      if (e.hp <= 0) this.killEnemy(e);
    }
    // blade arc visual
    for (let i = -3; i <= 3; i++) {
      const a = aimA + (i / 3) * (w.arc / 2);
      this.particles.burst(
        p.x + Math.sin(a) * w.range * 0.75, 1.2, p.z + Math.cos(a) * w.range * 0.75,
        3, w.color, 3.5, 0.22, 2, 0.1,
      );
    }
    this.audio.sfx(w.sfx);
    if (this.meleeId === "powerfist" && hit) {
      this.explode(p.x + this.aimX * 1.6, p.z + this.aimZ * 1.6, 2.4, 40);
    }
    this.shake = Math.min(1, this.shake + (hit ? 0.14 : 0.05));
  }

  private dropPickup(x: number, z: number, kind: PickupKind, weaponId: string): void {
    for (const pk of this.pickups) {
      if (pk.active) continue;
      pk.active = true;
      pk.kind = kind;
      pk.weaponId = weaponId;
      pk.mesh.geometry = this.pickupGeos[kind];
      pk.mesh.material = this.pickupMats[kind];
      pk.mesh.scale.setScalar(isBoostKind(kind) ? 1.15 : 1);
      pk.mesh.visible = true;
      pk.mesh.position.set(x, 0.6, z);
      return;
    }
  }

  /** Weighted roll for a battlefield boon drop. */
  private dropRandomBoost(x: number, z: number): void {
    let roll = Math.random();
    for (const def of BOOST_PICKUPS) {
      roll -= def.weight;
      if (roll <= 0) {
        this.dropPickup(x, z, def.kind, "");
        return;
      }
    }
    this.dropPickup(x, z, BOOST_PICKUPS[0].kind, "");
  }

  /** A boon is picked up — timed ones arm, instant ones detonate. */
  private applyBoost(kind: PickupKind): void {
    const def = boostDef(kind);
    const p = this.player.group.position;
    this.audio.sfx(kind === "purge" ? "boom" : kind === "fury" ? "charge" : "upgrade");
    this.spawnRing(p.x, p.z, def.color, kind === "purge" ? 14 : 4, kind === "purge" ? 0.9 : 0.45);
    this.particles.burst(p.x, 1.2, p.z, 26, def.color, 6, 0.7, 6);
    this.hud.toast(`${def.icon} ${def.name.toUpperCase()}`);
    switch (kind) {
      case "magnet":
        this.boostT.magnet = def.duration;
        break;
      case "shield":
        this.boostT.shield = def.duration;
        this.shieldBubble.visible = true;
        break;
      case "doubledmg":
        this.boostT.doubledmg = def.duration;
        break;
      case "fury":
        this.addUlt(50);
        break;
      case "purge": {
        // the Emperor's wrath: the map burns, the boss merely bleeds
        this.shake = 1;
        this.muzzleLight.position.set(p.x, 3, p.z);
        this.muzzleLight.color.setHex(0xfff2c0);
        this.muzzleLight.intensity = 80;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.particles.burst(p.x + Math.sin(a) * 5, 1, p.z + Math.cos(a) * 5, 10, 0xffe9b0, 8, 0.8, 9);
        }
        for (const e of [...this.enemies.list]) {
          if (!e.active) continue;
          if (isBoss(e.kind)) {
            e.hp -= 300;
            e.flashT = 0.3;
            if (e.hp <= 0) this.killEnemy(e);
          } else {
            this.killEnemy(e);
          }
        }
        break;
      }
    }
  }

  // ── one-shot FX helpers ──────────────────────────────────────────

  /** Expanding shockwave ring on the ground — nova, purge, boon activations. */
  private spawnRing(x: number, z: number, color: number, maxR: number, dur: number): void {
    for (const r of this.fxRings) {
      if (r.t > 0) continue;
      r.t = dur;
      r.dur = dur;
      r.maxR = maxR;
      r.mesh.visible = true;
      r.mesh.position.set(x, 0.12, z);
      r.mesh.scale.setScalar(0.01);
      (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      return;
    }
  }

  /** A pillar of light from the sky — the orbital lance made visible. */
  private spawnBeam(x: number, z: number, color: number, dur: number): void {
    for (const b of this.fxBeams) {
      if (b.t > 0) continue;
      b.t = dur;
      b.dur = dur;
      b.mesh.visible = true;
      b.mesh.position.set(x, 15, z);
      (b.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      return;
    }
  }

  /** Frame-step the FX pools; called from update() in every state. */
  private updateFx(dt: number): void {
    for (const r of this.fxRings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const f = 1 - Math.max(0, r.t) / r.dur;
      const ease = 1 - (1 - f) * (1 - f); // fast out, slow settle
      r.mesh.scale.setScalar(Math.max(0.01, r.maxR * ease));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - f);
      if (r.t <= 0) r.mesh.visible = false;
    }
    for (const b of this.fxBeams) {
      if (b.t <= 0) continue;
      b.t -= dt;
      const f = Math.max(0, b.t) / b.dur;
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * f;
      const w = 0.7 + (1 - f) * 0.6;
      b.mesh.scale.set(w, 1, w);
      if (b.t <= 0) b.mesh.visible = false;
    }
    // iron halo breathes while it holds
    if (this.shieldBubble.visible) {
      const p = this.player.group.position;
      this.shieldBubble.position.set(p.x, 1.0, p.z);
      const m = this.shieldBubble.material as THREE.MeshBasicMaterial;
      m.opacity = 0.14 + Math.sin(this.t * 6) * 0.05;
      const s = 1 + Math.sin(this.t * 6) * 0.04;
      this.shieldBubble.scale.setScalar(s * (0.7 + 0.3 * this.hero.scale));
    }
  }

  /** Every faction shoots differently — match the projectile to the lore. */
  private enemyShoot(x: number, z: number, dx: number, dz: number, dmg: number, proj: ProjKind): void {
    const fire = (angleOff: number, speed: number, life: number, mat: "hostile" | "warpBolt" | "gauss" | "pulse" | "shuriken",
      scale: [number, number, number], radius: number) => {
      const a = Math.atan2(dx, dz) + angleOff;
      this.bullets.fire(false, x, z, Math.sin(a), Math.cos(a), speed, dmg, life, 0,
        { mat, scale, radius });
    };
    // faction muzzle flash — the enemy's fire reads nothing like Imperial shells
    const flashCol =
      proj === "gauss" ? 0x59ff8a :
      proj === "pulse" ? 0x7ab8ff :
      proj === "shuriken" ? 0xe8f2ff :
      proj === "bolt" ? 0xff5a4a : 0xa4ff5e;
    this.particles.burst(x, 1.2, z, 4, flashCol, 3, 0.22, 3, 0.2);
    switch (proj) {
      case "bolt": // chaos & votann — disciplined bolt volleys
        fire(-0.06, 26, 1.6, "warpBolt", [0.7, 0.7, 2.4], 0.35);
        fire(0, 26, 1.6, "warpBolt", [0.7, 0.7, 2.4], 0.35);
        fire(0.06, 26, 1.6, "warpBolt", [0.7, 0.7, 2.4], 0.35);
        this.audio.sfx("shot");
        break;
      case "gauss": // necron disintegration rod — fast and true
        fire(0, 30, 2.0, "gauss", [0.55, 0.55, 3.4], 0.35);
        this.audio.sfx("meltaShot");
        break;
      case "pulse": // tau pulse rifle — the fastest bolt on the field
        fire(0, 34, 1.8, "pulse", [0.9, 0.9, 3.0], 0.4);
        this.audio.sfx("plasmaShot");
        break;
      case "shuriken": // eldar fan of monomolecular discs
        fire(-0.16, 24, 1.2, "shuriken", [0.5, 0.5, 1.2], 0.3);
        fire(0, 24, 1.2, "shuriken", [0.5, 0.5, 1.2], 0.3);
        fire(0.16, 24, 1.2, "shuriken", [0.5, 0.5, 1.2], 0.3);
        this.audio.sfx("blade");
        break;
      default:
        fire(0, 12, 2.4, "hostile", [1, 1, 1], 0.4);
        this.audio.sfx("spit");
    }
  }

  /** Boss radial bursts, themed per faction. */
  private bossBurst(x: number, z: number, dmg: number, kind: EnemyKind): void {
    const conf =
      kind === "bossGargant" ? { n: 16, speed: 9, mat: "hostile" as const } :
      kind === "bossWraith" ? { n: 12, speed: 13, mat: "shuriken" as const } :
      kind === "bossPhaeron" ? { n: 10, speed: 14, mat: "gauss" as const } :
      kind === "bossCrisis" ? { n: 12, speed: 16, mat: "pulse" as const } :
      kind === "bossFex" ? { n: 8, speed: 11, mat: "hostile" as const } :
      { n: 10, speed: 10, mat: "warpBolt" as const };
    for (let i = 0; i < conf.n; i++) {
      const a = (i / conf.n) * Math.PI * 2;
      this.bullets.fire(false, x, z, Math.sin(a), Math.cos(a), conf.speed, dmg, 2.6, 0, { mat: conf.mat });
    }
    this.audio.sfx("bossRoar");
    this.shake = Math.min(1, this.shake + 0.4);
  }

  private killEnemy(e: Enemy): void {
    // necron reanimation protocol: the first "kill" only puts it down for a while —
    // no score, no loot, and the wave is not over until it stays down
    if (e.kind === "necron" && !e.revived) {
      e.revived = true;
      this.audio.sfx("enemyDie");
      this.particles.burst(e.mesh.position.x, 1, e.mesh.position.z, 20, 0x59ff8a, 6, 0.7, 9);
      this.enemies.beginRevive(e);
      return;
    }
    const m = e.mesh.position;
    const bossKind = isBoss(e.kind);
    this.score += e.score;
    this.addUlt(bossKind ? 40 : 4);
    this.audio.sfx("enemyDie");
    this.shake = Math.min(1, this.shake + (bossKind ? 0.8 : e.kind === "brute" ? 0.2 : 0.06));
    const big = e.kind === "brute" || bossKind;
    this.particles.burst(m.x, 1, m.z, big ? 34 : 16, 0x8a1f1f, big ? 8 : 6, 0.8, 11);
    this.particles.burst(m.x, 1, m.z, big ? 18 : 7, e.kind === "spitter" ? 0x9fff5a : 0xff6a3a, 4, 0.5, 8);
    // medicae stim drop
    if (!bossKind && Math.random() < 0.12) {
      this.dropPickup(m.x, m.z, "heal", "");
    }
    // weapon drop: elites carry the good stuff
    const dropChance = e.kind === "brute" ? 0.22 : e.kind === "spitter" ? 0.14 : e.kind === "cultist" ? 0.04 : 0;
    if (Math.random() < dropChance) {
      const wantRanged = Math.random() < 0.55;
      const pool = wantRanged
        ? RANGED_WEAPONS.filter((x) => x.id !== this.rangedId)
        : MELEE_WEAPONS.filter((x) => x.id !== this.meleeId);
      const w = pool[Math.floor(Math.random() * pool.length)];
      this.dropPickup(m.x, m.z, wantRanged ? "ranged" : "melee", w.id);
    }
    // battlefield boons: bosses always spill one, elites often, rank and file rarely
    const boostChance = bossKind ? 1 : e.kind === "brute" ? 0.3 : e.kind === "spitter" || e.kind === "chaos" ? 0.08 : 0.035;
    if (Math.random() < boostChance) {
      this.dropRandomBoost(m.x, m.z);
    }
    this.enemies.kill(e);
  }

  // ── per-frame ────────────────────────────────────────────────────

  private update(dt: number): void {
    this.t += dt;
    this.world.update(this.t);
    this.particles.update(dt);
    this.updateFx(dt);
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 180);

    // global keys, valid in (almost) any state
    if (this.input.consumeAction("KeyM")) this.hud.setMute(this.audio.toggleMute());
    if (this.input.consumeAction("Escape")) {
      if (this.state === "playing" || this.state === "paused") this.togglePause();
      else if (this.state === "campaign" || this.state === "briefing") this.backToTitle();
    }

    switch (this.state) {
      case "title": {
        if (this.input.consumeAction("Space") || this.input.consumeAction("Enter")) this.quickStart();
        break;
      }
      case "briefing": {
        if (this.input.consumeAction("Space") || this.input.consumeAction("Enter")) this.startRun();
        break;
      }
      case "campaign":
        break;
      case "playing": {
        this.updatePlaying(dt);
        break;
      }
      case "upgrade": {
        for (let i = 0; i < 3; i++) {
          if (this.input.consumeAction(`Digit${i + 1}`)) this.pickUpgrade(i);
        }
        break;
      }
      case "gameover":
      case "victory": {
        if (this.input.consumeAction("KeyR") || this.input.consumeAction("Space")) this.startRun();
        break;
      }
      case "paused":
        break;
    }

    // fps watchdog → graceful degrade (pixel ratio + particle budget)
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      const fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (!this.degraded && this.state === "playing") {
        if (fps < QUALITY.DEGRADE_FPS) {
          this.lowFpsT += 0.5;
          if (this.lowFpsT >= 2) {
            this.degraded = true;
            this.renderer.setPixelRatio(1);
            this.particles.enabled = false;
            this.onResize();
          }
        } else {
          this.lowFpsT = 0;
        }
      }
    }
  }

  private updatePlaying(dt: number): void {
    const p = this.player.group.position;
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.dashCdT = Math.max(0, this.dashCdT - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);

    // battlefield boons tick down
    this.boostT.magnet = Math.max(0, this.boostT.magnet - dt);
    this.boostT.shield = Math.max(0, this.boostT.shield - dt);
    this.boostT.doubledmg = Math.max(0, this.boostT.doubledmg - dt);
    if (this.boostT.shield <= 0 && this.shieldBubble.visible) this.shieldBubble.visible = false;

    // ── movement ──
    let mx = this.input.moveX;
    let mz = -this.input.moveZ; // W (forward, +1) = screen up = world -z
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) { mx /= mLen; mz /= mLen; }

    const wantDash =
      this.input.consumeAction("ShiftLeft") || this.input.consumeAction("ShiftRight") ||
      this.input.consumeAction("Space") || this.touchDashQueued;
    this.touchDashQueued = false;
    if (wantDash && this.dashCdT <= 0 && this.dashT <= 0) {
      this.dashT = PLAYER.DASH_TIME;
      this.dashCdT = PLAYER.DASH_CD * this.hero.dashCdMul * this.stats.dashCdMul;
      if (mLen > 0.1) {
        this.dashDirX = mx;
        this.dashDirZ = mz;
      } else {
        this.dashDirX = this.aimX;
        this.dashDirZ = this.aimZ;
      }
      this.audio.sfx("dash");
      this.particles.burst(p.x, 0.6, p.z, 12, 0x7df0ff, 5, 0.4, 4);
    }

    let moving = false;
    if (this.dashT > 0) {
      this.dashT -= dt;
      p.x += this.dashDirX * PLAYER.DASH_SPEED * dt;
      p.z += this.dashDirZ * PLAYER.DASH_SPEED * dt;
      this.particles.burst(p.x, 0.4, p.z, 2, 0x3d7a8c, 2, 0.3, 2, 0.1);
      moving = true;
    } else if (mLen > 0.01) {
      const sp = PLAYER.SPEED * this.hero.speedMul * this.stats.speedMul;
      p.x += mx * sp * dt;
      p.z += mz * sp * dt;
      moving = true;
    }
    p.x = Math.max(-ARENA.HALF_W, Math.min(ARENA.HALF_W, p.x));
    p.z = Math.max(-ARENA.HALF_D, Math.min(ARENA.HALF_D, p.z));
    pushOutObstacles(p, this.playerRadius, this.world.obstacles);
    this.player.animate(this.t, moving);
    // hit-flash blink while invulnerable
    this.player.group.visible = this.invulnT <= 0 || Math.sin(this.t * 30) > -0.3;

    // ── aim ──
    let firing = false;
    if (this.aimTouch) {
      const dx = this.aimTouch.cx - this.aimTouch.ox;
      const dy = this.aimTouch.cy - this.aimTouch.oy;
      const len = Math.hypot(dx, dy);
      if (len > 16) {
        this.aimX = dx / len;
        this.aimZ = dy / len; // screen down = +z, matches world orientation
        firing = true;
      }
    } else if (!this.hud.isTouch) {
      this.ndc.set((this.mouse.x / window.innerWidth) * 2 - 1, -(this.mouse.y / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint)) {
        const dx = this.aimPoint.x - p.x;
        const dz = this.aimPoint.z - p.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.3) {
          this.aimX = dx / len;
          this.aimZ = dz / len;
        }
      }
      firing = this.mouse.down;
    }
    this.player.group.rotation.y = Math.atan2(this.aimX, this.aimZ);

    // ── fire ──
    if (firing && this.fireTimer <= 0) {
      this.fireTimer = rangedById(this.rangedId).interval * this.stats.fireIntMul;
      this.fireWeapon();
    }

    // ── melee ──
    this.meleeCdT = Math.max(0, this.meleeCdT - dt);
    const wantMelee = this.input.consumeAction("KeyE") || this.meleeQueued;
    this.meleeQueued = false;
    if (wantMelee && this.meleeCdT <= 0) this.swingMelee();

    // ── ultimate ──
    this.addUlt(1.5 * dt); // fury builds even between kills
    if (this.hero.passive?.regen) {
      this.hp = Math.min(this.maxHp, this.hp + this.hero.passive.regen * dt);
    }
    const wantUlt = this.input.consumeAction("KeyQ") || this.touchUltQueued;
    this.touchUltQueued = false;
    if (wantUlt && this.ultCharge >= 100) {
      this.ultCharge = 0;
      this.fireUlt();
    }
    // delayed orbital strikes walk in on their own timers — each one a
    // golden pillar from the fleet, then the blast
    for (let i = this.pendingBlasts.length - 1; i >= 0; i--) {
      const b = this.pendingBlasts[i];
      b.t -= dt;
      if (b.t <= 0) {
        this.spawnBeam(b.x, b.z, 0xffe9b0, 0.28);
        this.spawnRing(b.x, b.z, 0xffd27a, b.r, 0.4);
        this.explode(b.x, b.z, b.r, b.dmg);
        this.pendingBlasts.splice(i, 1);
      }
    }

    // ── spawner ──
    if (this.queue.length > 0) {
      this.spawnTimer -= dt;
      const maxConc = Math.min(5 + this.wave + Math.floor(this.currentLevel / 4), 20);
      if (this.spawnTimer <= 0 && this.enemies.activeCount() < maxConc) {
        this.spawnTimer = this.spawnInterval;
        const kind = this.queue.shift()!;
        let sx = 0, sz = 0;
        if (isBoss(kind)) {
          sx = 0; sz = -ARENA.HALF_D + 2; // emerges from the altar
          this.audio.sfx("bossRoar");
          this.shake = 1;
        } else {
          for (let tries = 0; tries < 8; tries++) {
            const edge = Math.floor(Math.random() * 4);
            if (edge === 0) { sx = -ARENA.HALF_W + 1; sz = (Math.random() * 2 - 1) * ARENA.HALF_D; }
            else if (edge === 1) { sx = ARENA.HALF_W - 1; sz = (Math.random() * 2 - 1) * ARENA.HALF_D; }
            else if (edge === 2) { sz = -ARENA.HALF_D + 1; sx = (Math.random() * 2 - 1) * ARENA.HALF_W; }
            else { sz = ARENA.HALF_D - 1; sx = (Math.random() * 2 - 1) * ARENA.HALF_W; }
            if (Math.hypot(sx - p.x, sz - p.z) > 9 && !insideObstacle(sx, sz, 1.2, this.world.obstacles)) break;
          }
        }
        const { hpMul, dmgMul } = waveScaling(this.currentLevel, this.wave, this.diff);
        this.enemies.spawn(kind, sx, sz, hpMul, dmgMul);
        this.particles.burst(sx, 1, sz, 14, 0x9a4ad0, 4, 0.5, 3);
      }
    }

    // ── enemies ──
    this.enemies.update(
      dt, this.t, p.x, p.z,
      (dmg) => this.damagePlayer(dmg),
      (x, z, dx, dz, dmg, proj) => this.enemyShoot(x, z, dx, dz, dmg, proj),
      () => this.audio.sfx("charge"),
      (x, z, dmg, kind) => this.bossBurst(x, z, dmg, kind),
    );

    // ── bullets & collisions ──
    this.bullets.update(dt);
    for (const b of this.bullets.friendly) {
      if (!b.active) continue;
      const bx = b.mesh.position.x, bz = b.mesh.position.z;
      if (insideObstacle(bx, bz, b.radius, this.world.obstacles)) {
        if (b.aoe > 0) this.explode(bx, bz, b.aoe, b.dmg);
        this.bullets.kill(b);
        continue;
      }
      for (const e of this.enemies.list) {
        if (!e.active) continue;
        const ex = e.mesh.position.x, ez = e.mesh.position.z;
        const rr = e.radius + b.radius;
        if ((bx - ex) * (bx - ex) + (bz - ez) * (bz - ez) > rr * rr) continue;
        if (b.aoe > 0) {
          this.explode(bx, bz, b.aoe, b.dmg);
          this.bullets.kill(b);
          break;
        }
        e.hp -= b.dmg;
        e.flashT = 0.12;
        this.particles.burst(bx, 1, bz, 5, 0x8a1f1f, 4, 0.4, 8);
        this.audio.sfx("enemyHit");
        if (e.hp <= 0) this.killEnemy(e);
        if (b.pierce > 0) {
          b.pierce--;
        } else {
          this.bullets.kill(b);
          break;
        }
      }
    }
    for (const b of this.bullets.hostile) {
      if (!b.active) continue;
      const bx = b.mesh.position.x, bz = b.mesh.position.z;
      if (insideObstacle(bx, bz, b.radius, this.world.obstacles)) {
        this.bullets.kill(b);
        continue;
      }
      const dx = bx - p.x;
      const dz = bz - p.z;
      const rr = this.playerRadius + b.radius;
      if (dx * dx + dz * dz < rr * rr) {
        this.bullets.kill(b);
        this.damagePlayer(b.dmg);
      }
    }

    // ── pickups ──
    const magnetOn = this.boostT.magnet > 0;
    this.sparkleT -= dt;
    for (const pk of this.pickups) {
      if (!pk.active) continue;
      const m = pk.mesh.position;
      pk.mesh.rotation.y += dt * 3;
      m.y = 0.6 + Math.sin(this.t * 4 + m.x) * 0.12;
      // boons throb with promise; plain supplies keep a steady silhouette
      if (isBoostKind(pk.kind)) {
        pk.mesh.scale.setScalar(1.15 + Math.sin(this.t * 6 + m.z) * 0.18);
        if (this.sparkleT <= 0) {
          this.particles.burst(m.x, 1.0, m.z, 1,
            (this.pickupMats[pk.kind] as THREE.MeshBasicMaterial).color.getHex(), 1.2, 0.4, 1, 0.5);
        }
      }
      const dx = p.x - m.x, dz = p.z - m.z;
      const d = Math.hypot(dx, dz);
      const pullR = magnetOn ? 40 : 4;
      if (d < pullR && d > 0.01) {
        const pull = magnetOn ? 13 : 6;
        m.x += (dx / d) * pull * dt;
        m.z += (dz / d) * pull * dt;
      }
      if (d < 1.2) {
        pk.active = false;
        pk.mesh.visible = false;
        if (pk.kind === "heal") {
          this.hp = Math.min(this.maxHp, this.hp + pk.heal);
          this.audio.sfx("pickup");
          this.particles.burst(p.x, 1.2, p.z, 12, 0x59ff8a, 4, 0.5, 5);
        } else if (isBoostKind(pk.kind)) {
          this.applyBoost(pk.kind);
        } else {
          if (pk.kind === "ranged") this.rangedId = pk.weaponId;
          else this.meleeId = pk.weaponId;
          this.hud.setWeapons(rangedById(this.rangedId).name, meleeById(this.meleeId).name);
          this.audio.sfx("upgrade");
          const col = pk.kind === "ranged" ? 0xffd27a : 0x7df0ff;
          this.particles.burst(p.x, 1.2, p.z, 20, col, 5, 0.6, 6);
        }
      }
    }
    if (this.sparkleT <= 0) this.sparkleT = 0.12;

    // ── wave progression ──
    const boss = this.enemies.boss();
    this.hud.setBoss(boss ? boss.hp / boss.maxHp : null);
    if (this.queue.length === 0 && this.enemies.activeCount() === 0 && this.enemies.pendingRevives() === 0) {
      this.score += this.wave * 50;
      if (this.wave >= WAVES_PER_LEVEL) {
        this.endRun(true);
        return;
      }
      this.offers = rollUpgrades(this.stats, { ranged: this.rangedId, melee: this.meleeId }, 3);
      this.hud.showUpgrades(this.offers);
      this.setState("upgrade");
    }

    // ── warp whisper when the light is fading ──
    const low = this.hp / this.maxHp < 0.3;
    if (low && !this.whisperActive) {
      this.whisperActive = true;
      this.audio.startWhisper();
    } else if (!low && this.whisperActive) {
      this.whisperActive = false;
      this.audio.stopWhisper();
    }

    // ── HUD ──
    this.hud.setHp(this.hp, this.maxHp);
    this.hud.setWave(this.plan.name, this.wave, WAVES_PER_LEVEL,
      this.queue.length + this.enemies.activeCount());
    this.hud.setScore(this.score, this.best);
    this.hud.setDash(this.dashCdT <= 0 ? 1 : 1 - this.dashCdT / (PLAYER.DASH_CD * this.hero.dashCdMul * this.stats.dashCdMul));
    const mw = meleeById(this.meleeId);
    this.hud.setMeleeCd(this.meleeCdT <= 0 ? 1 : 1 - this.meleeCdT / mw.cooldown);
    this.hud.setUlt(this.ultCharge / 100, ULT_NAMES[this.hero.ult]);
    const activeBoosts = [];
    if (this.boostT.shield > 0) activeBoosts.push({ icon: "🛡", name: "Ореол", frac: this.boostT.shield / 10 });
    if (this.boostT.doubledmg > 0) activeBoosts.push({ icon: "⚔", name: "Ярость ×2", frac: this.boostT.doubledmg / 15 });
    if (this.boostT.magnet > 0) activeBoosts.push({ icon: "🧲", name: "Захват", frac: this.boostT.magnet / 25 });
    this.hud.setBoosts(activeBoosts);
  }

  private render(): void {
    const p = this.player.group.position;
    this.heroLight.position.set(p.x, 5, p.z);
    if (this.state === "title" || this.state === "campaign" || this.state === "briefing") {
      // slow liturgical orbit around the altar
      const a = this.t * 0.12;
      this.camera.position.set(Math.sin(a) * 16, 10, -2 + Math.cos(a) * 10);
      this.camera.lookAt(0, 3, -14);
    } else {
      // aim lookahead + shake
      const lx = p.x + this.aimX * 2.2;
      const lz = p.z + this.aimZ * 2.2;
      this.shake = Math.max(0, this.shake - 0.016 * 2.2);
      const s = this.shake * this.shake;
      const ox = (Math.random() - 0.5) * s * 1.4;
      const oz = (Math.random() - 0.5) * s * 1.4;
      this.camTarget.set(
        lx + CAM_OFF.x * this.camDistMul + ox,
        CAM_OFF.y * this.camDistMul,
        lz + CAM_OFF.z * this.camDistMul + oz,
      );
      this.camera.position.lerp(this.camTarget, 0.18);
      this.camera.lookAt(lx + ox, 0.8, lz + oz);
    }
    this.renderer.render(this.world.scene, this.camera);
    window.__GAME_READY__ = true;
  }

  probe(): { x: number; y: number; z: number } {
    const p = this.player.group.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  dispose(): void {
    this.loop.stop();
    for (const off of this.unsub) off();
    this.unsub = [];
    this.input.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.particles.dispose();
    this.bullets.dispose();
    this.enemies.dispose();
    this.player.dispose();
    for (const g of Object.values(this.pickupGeos)) g.dispose();
    for (const m of Object.values(this.pickupMats)) m.dispose();
    this.shieldBubble.geometry.dispose();
    (this.shieldBubble.material as THREE.Material).dispose();
    if (this.fxRings.length > 0) {
      this.fxRings[0].mesh.geometry.dispose();
      for (const r of this.fxRings) (r.mesh.material as THREE.Material).dispose();
    }
    if (this.fxBeams.length > 0) {
      this.fxBeams[0].mesh.geometry.dispose();
      for (const b of this.fxBeams) (b.mesh.material as THREE.Material).dispose();
    }
    this.world.dispose();
    this.renderer.dispose();
  }
}

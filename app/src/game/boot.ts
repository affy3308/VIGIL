/**
 * boot.ts — mounts VIGIL: The Last Bastion onto the canvas from src/pages/Home.tsx.
 * Keeps the template contract: startGame/stopGame, window.__GAME_READY__, window.__gameProbe.
 */

import { Game } from "./game";

declare global {
  interface Window {
    /** Player-coordinate probe — scripts/verify-game.mjs asserts direction mapping through it. */
    __gameProbe?: () => { x: number; y: number; z: number };
    /** Readiness signal — the self-check waits for it before screenshotting/asserting. */
    __GAME_READY__?: boolean;
    /** Debug handle for automated playtests (state forcing, screenshots). */
    __vigil?: Game;
  }
}

let session: { dispose: () => void } | null = null;

export function startGame(canvas: HTMLCanvasElement): void {
  stopGame();
  const overlay = document.getElementById("ui-overlay");
  const game = new Game(canvas, overlay ?? document.body);
  window.__gameProbe = () => game.probe();
  window.__vigil = game;
  session = {
    dispose: () => {
      game.dispose();
      delete window.__gameProbe;
      delete window.__vigil;
      window.__GAME_READY__ = false;
    },
  };
}

export function stopGame(): void {
  session?.dispose();
  session = null;
}

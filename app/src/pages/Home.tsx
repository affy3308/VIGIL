/**
 * Home.tsx — hosts the game canvas + the HUD overlay (#ui-overlay is populated by src/game/hud.ts).
 * React owns only the DOM shell; the render loop lives under src/game/.
 */

import { useEffect, useRef } from 'react'
import { startGame, stopGame } from '@/game/boot'

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    startGame(canvas)
    return () => stopGame()
  }, [])

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div id="ui-overlay" />
    </div>
  )
}

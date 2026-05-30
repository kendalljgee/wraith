import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useStore } from '../store/battleStore'
import type { Drone } from '../store/battleStore'

const WIDTH = 800
const HEIGHT = 600

export default function BattleCanvas() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const droneSprites = useRef<Map<string, PIXI.Container>>(new Map())
  const commsLayer = useRef<PIXI.Graphics | null>(null)
  const defenseLayer = useRef<PIXI.Graphics | null>(null)
  const drones = useStore(s => s.drones)
  const defenseAssets = useStore((s: any) => s.defenseAssets || [])

  // Initialize PixiJS once
  useEffect(() => {
    if (!canvasRef.current || appRef.current) return

    const app = new PIXI.Application()

    app.init({
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: 0x080c10,
      antialias: true,
    }).then(() => {
      if (!canvasRef.current) return
      canvasRef.current.appendChild(app.canvas)
      appRef.current = app

      // Layer order: defense → comms → drones
      const dLayer = new PIXI.Graphics()
      const cLayer = new PIXI.Graphics()
      app.stage.addChild(dLayer)
      app.stage.addChild(cLayer)
      defenseLayer.current = dLayer
      commsLayer.current = cLayer

      // Grid overlay for ops-center feel
      const grid = new PIXI.Graphics()
      for (let x = 0; x <= WIDTH; x += 80) {
        grid.moveTo(x, 0).lineTo(x, HEIGHT)
      }
      for (let y = 0; y <= HEIGHT; y += 60) {
        grid.moveTo(0, y).lineTo(WIDTH, y)
      }
      grid.stroke({ color: 0x1e2d3d, width: 0.5, alpha: 0.5 })
      app.stage.addChildAt(grid, 0)

      // Objective marker — bottom center
      const obj = new PIXI.Graphics()
      obj.circle(400, 520, 20)
      obj.stroke({ color: 0xef4444, width: 1.5, alpha: 0.8 })
      obj.moveTo(390, 520).lineTo(410, 520)
      obj.moveTo(400, 510).lineTo(400, 530)
      obj.stroke({ color: 0xef4444, width: 1, alpha: 0.6 })
      app.stage.addChild(obj)
    })

    return () => {
      app.destroy(true)
      appRef.current = null
      droneSprites.current.clear()
    }
  }, [])

  // Update sprites whenever drone state changes
  useEffect(() => {
    const app = appRef.current
    if (!app || !commsLayer.current) return

    const stage = app.stage

    // ── drone sprites ──────────────────────────────────────
    drones.forEach(drone => {
      if (!droneSprites.current.has(drone.id)) {
        const container = new PIXI.Container()

        // Triangle body
        const g = new PIXI.Graphics()
        drawDroneShape(g, drone)
        container.addChild(g)

        // Status dot (jammed/spoofed indicator)
        const dot = new PIXI.Graphics()
        dot.label = 'status'
        container.addChild(dot)

        stage.addChild(container)
        droneSprites.current.set(drone.id, container)
      }

      const container = droneSprites.current.get(drone.id)!
      const body = container.children[0] as PIXI.Graphics
      const dot = container.children[1] as PIXI.Graphics

      // Position + rotation
      container.x = drone.x
      container.y = drone.y
      container.rotation = Math.atan2(drone.vy, drone.vx) + Math.PI / 2
      container.alpha = drone.alive ? 1 : 0

      // Redraw on state change
      body.clear()
      drawDroneShape(body, drone)

      // Status indicator dot
      dot.clear()
      if (drone.alive) {
        if (drone.jammed) {
          dot.circle(0, -10, 3)
          dot.fill({ color: 0xf59e0b })   // amber = jammed
        } else if (drone.spoofed) {
          dot.circle(0, -10, 3)
          dot.fill({ color: 0xa855f7 })   // purple = spoofed
        }
      }
    })

    // Remove sprites for drones no longer in state
    droneSprites.current.forEach((sprite, id) => {
      if (!drones.find(d => d.id === id)) {
        stage.removeChild(sprite)
        sprite.destroy()
        droneSprites.current.delete(id)
      }
    })

    // ── comms lines ────────────────────────────────────────
    const cLayer = commsLayer.current
    cLayer.clear()
    drones.forEach(drone => {
      if (!drone.alive || drone.jammed) return
      drone.comms_links.forEach(linkedId => {
        const target = drones.find(d => d.id === linkedId)
        if (!target || !target.alive) return
        // Only draw each link once
        if (drone.id < linkedId) {
          cLayer.moveTo(drone.x, drone.y)
          cLayer.lineTo(target.x, target.y)
        }
      })
    })
    cLayer.stroke({ color: 0x00ff88, width: 0.5, alpha: 0.2 })

    // ── defense asset rings ─────────────────────────────────
    const dLayer = defenseLayer.current
    if (dLayer) {
      dLayer.clear()
      defenseAssets.forEach((asset: any) => {
        if (!asset.active) return
        const color = asset.type === 'jammer'      ? 0xf59e0b
                    : asset.type === 'interceptor' ? 0xef4444
                    : 0xa855f7                       // spoofer

        dLayer.circle(asset.x, asset.y, asset.radius)
        dLayer.stroke({ color, width: 1, alpha: 0.3 })
        dLayer.circle(asset.x, asset.y, 5)
        dLayer.fill({ color, alpha: 0.8 })
      })
    }

  }, [drones, defenseAssets])

  return (
    <div
      ref={canvasRef}
      className="rounded border border-wraith-border overflow-hidden"
      style={{ width: WIDTH, height: HEIGHT }}
    />
  )
}

// ── helpers ────────────────────────────────────────────────

function drawDroneShape(g: PIXI.Graphics, drone: Drone) {
  if (!drone.alive) return

  const color = drone.jammed  ? 0xf59e0b   // amber = jammed
              : drone.spoofed ? 0xa855f7   // purple = spoofed
              : drone.team === 'red' ? 0xff4444  // red = attacker
              : 0x4a9eff                    // blue = defender

  // Triangle pointing up (rotation handles direction)
  g.poly([0, -7, 5, 5, -5, 5])
  g.fill({ color, alpha: 0.9 })
  g.poly([0, -7, 5, 5, -5, 5])
  g.stroke({ color: 0xffffff, width: 0.5, alpha: 0.3 })
}
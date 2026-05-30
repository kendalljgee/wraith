import { useEffect, useRef } from 'react'
import * as PIXI from 'pixi.js'
import { useStore } from '../store/battleStore'
import type { DefenseAsset, DefenseAssetType, Drone, TerrainZone } from '../store/battleStore'

const WIDTH = 800
const HEIGHT = 600
const CENTER_GRAB_RADIUS = 12

const ASSET_COLORS: Record<DefenseAssetType, number> = {
  jammer: 0xf59e0b,
  interceptor: 0xef4444,
  spoofer: 0xa855f7,
}

const ASSET_RADII: Record<DefenseAssetType, number> = {
  jammer: 110,
  interceptor: 60,
  spoofer: 110,
}

interface BattleCanvasProps {
  mode?: 'challenge' | 'spectator' | 'edit'
  onPlaceAsset?: (asset: { id: string; x: number; y: number; type: DefenseAssetType }) => void
  onMoveAsset?: (asset: { id: string; x: number; y: number }) => void
  onRemoveAsset?: (asset: { id: string }) => void
  selectedAsset?: DefenseAssetType
  previewRadius?: number
  removeMode?: boolean
}

export default function BattleCanvas({
  mode = 'spectator',
  onPlaceAsset,
  onMoveAsset,
  onRemoveAsset,
  selectedAsset = 'jammer',
  previewRadius,
  removeMode = false,
}: BattleCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<PIXI.Application | null>(null)
  const droneSprites = useRef<Map<string, PIXI.Container>>(new Map())
  const commsLayer = useRef<PIXI.Graphics | null>(null)
  const defenseLayer = useRef<PIXI.Graphics | null>(null)
  const terrainLayer = useRef<PIXI.Graphics | null>(null)

  const modeRef = useRef(mode)
  const onPlaceAssetRef = useRef<typeof onPlaceAsset | null>(onPlaceAsset || null)
  const onMoveAssetRef = useRef<typeof onMoveAsset | null>(onMoveAsset || null)
  const onRemoveAssetRef = useRef<typeof onRemoveAsset | null>(onRemoveAsset || null)
  const selectedAssetRef = useRef<DefenseAssetType>(selectedAsset)
  const previewRadiusRef = useRef(previewRadius || ASSET_RADII[selectedAsset])
  const defenseAssetsRef = useRef<DefenseAsset[]>([])
  const terrainZonesRef = useRef<TerrainZone[]>([])
  const removeModeRef = useRef(removeMode)
  const pointerHandlersRef = useRef<{
    down: (event: PIXI.FederatedPointerEvent) => void
    move: (event: PIXI.FederatedPointerEvent) => void
    up: () => void
    out: () => void
  } | null>(null)
  const previewRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef<string | null>(null)

  const drones = useStore(s => s.drones)
  const defenseAssets = useStore(s => s.defenseAssets)
  const terrainZones = useStore(s => s.terrainZones)

  function drawDefenseLayer() {
    const dLayer = defenseLayer.current
    if (!dLayer) return

    dLayer.clear()
    defenseAssetsRef.current.forEach((asset) => {
      if (!asset.active) return
      drawAsset(dLayer, asset.x, asset.y, asset.radius, ASSET_COLORS[asset.type], 0.3, 0.8)
    })

    if (modeRef.current === 'challenge' && previewRef.current) {
      const color = ASSET_COLORS[selectedAssetRef.current]
      drawAsset(
        dLayer,
        previewRef.current.x,
        previewRef.current.y,
        previewRadiusRef.current,
        color,
        0.55,
        0.35,
        true,
      )
    }
  }

  function drawTerrainLayer() {
    const layer = terrainLayer.current
    if (!layer) return
    layer.clear()
    terrainZonesRef.current.forEach((zone) => {
      const color = zone.type === 'urban' ? 0x64748b
        : zone.type === 'ridge' ? 0x8b5e34
        : 0x38bdf8
      layer.rect(zone.x, zone.y, zone.width, zone.height)
      layer.fill({ color, alpha: 0.13 })
      layer.rect(zone.x, zone.y, zone.width, zone.height)
      layer.stroke({ color, width: 1, alpha: 0.35 })
    })
  }

  function findAssetCenterHit(x: number, y: number) {
    return defenseAssetsRef.current.find(asset => {
      if (!asset.active) return false
      const dx = asset.x - x
      const dy = asset.y - y
      return Math.sqrt(dx * dx + dy * dy) <= CENTER_GRAB_RADIUS
    })
  }

  useEffect(() => {
    modeRef.current = mode
    onPlaceAssetRef.current = onPlaceAsset || null
    onMoveAssetRef.current = onMoveAsset || null
    onRemoveAssetRef.current = onRemoveAsset || null
    selectedAssetRef.current = selectedAsset
    previewRadiusRef.current = previewRadius || ASSET_RADII[selectedAsset]
    removeModeRef.current = removeMode
    drawDefenseLayer()
  }, [mode, onPlaceAsset, onMoveAsset, onRemoveAsset, selectedAsset, previewRadius, removeMode])

  useEffect(() => {
    defenseAssetsRef.current = defenseAssets
    drawDefenseLayer()
  }, [defenseAssets])

  useEffect(() => {
    terrainZonesRef.current = terrainZones
    drawTerrainLayer()
  }, [terrainZones])

  useEffect(() => {
    if (!canvasRef.current || appRef.current) return

    const app = new PIXI.Application()
    const sprites = droneSprites.current

    app.init({
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: 0x080c10,
      antialias: true,
    }).then(() => {
      canvasRef.current!.appendChild(app.canvas as HTMLCanvasElement)
      appRef.current = app

      const dLayer = new PIXI.Graphics()
      const cLayer = new PIXI.Graphics()
      const tLayer = new PIXI.Graphics()
      app.stage.addChild(tLayer)
      app.stage.addChild(dLayer)
      app.stage.addChild(cLayer)
      terrainLayer.current = tLayer
      defenseLayer.current = dLayer
      commsLayer.current = cLayer

      const grid = new PIXI.Graphics()
      for (let x = 0; x <= WIDTH; x += 80) {
        grid.moveTo(x, 0).lineTo(x, HEIGHT)
      }
      for (let y = 0; y <= HEIGHT; y += 60) {
        grid.moveTo(0, y).lineTo(WIDTH, y)
      }
      grid.stroke({ color: 0x1e2d3d, width: 0.5, alpha: 0.5 })
      app.stage.addChildAt(grid, 0)

      const obj = new PIXI.Graphics()
      obj.circle(400, 520, 20)
      obj.stroke({ color: 0xef4444, width: 1.5, alpha: 0.8 })
      obj.moveTo(390, 520).lineTo(410, 520)
      obj.moveTo(400, 510).lineTo(400, 530)
      obj.stroke({ color: 0xef4444, width: 1, alpha: 0.6 })
      app.stage.addChild(obj)

      app.stage.eventMode = 'static'
      app.stage.hitArea = new PIXI.Rectangle(0, 0, WIDTH, HEIGHT)

      const pointerDownHandler = (e: PIXI.FederatedPointerEvent) => {
        if (modeRef.current !== 'challenge') return
        const pos = clampPoint(e.global.x, e.global.y)
        const hitAsset = findAssetCenterHit(pos.x, pos.y)

        if (hitAsset) {
          if (removeModeRef.current) {
            onRemoveAssetRef.current?.({ id: hitAsset.id })
            return
          }
          draggingRef.current = hitAsset.id
          previewRef.current = null
          drawDefenseLayer()
          return
        }

        if (!removeModeRef.current) {
          const type = selectedAssetRef.current
          const id = `manual_${type}_${Date.now()}`
          onPlaceAssetRef.current?.({ id, x: pos.x, y: pos.y, type })
        }
      }

      const pointerMoveHandler = (e: PIXI.FederatedPointerEvent) => {
        if (modeRef.current !== 'challenge') {
          previewRef.current = null
          drawDefenseLayer()
          return
        }

        const pos = clampPoint(e.global.x, e.global.y)
        if (draggingRef.current) {
          onMoveAssetRef.current?.({ id: draggingRef.current, x: pos.x, y: pos.y })
          return
        }

        previewRef.current = removeModeRef.current ? null : pos
        drawDefenseLayer()
      }

      const pointerUpHandler = () => {
        draggingRef.current = null
      }

      const pointerOutHandler = () => {
        if (!draggingRef.current) {
          previewRef.current = null
          drawDefenseLayer()
        }
      }

      pointerHandlersRef.current = {
        down: pointerDownHandler,
        move: pointerMoveHandler,
        up: pointerUpHandler,
        out: pointerOutHandler,
      }
      app.stage.on('pointerdown', pointerDownHandler)
      app.stage.on('pointermove', pointerMoveHandler)
      app.stage.on('pointerup', pointerUpHandler)
      app.stage.on('pointerupoutside', pointerUpHandler)
      app.stage.on('pointerout', pointerOutHandler)
    })

    return () => {
      const handlers = pointerHandlersRef.current
      if (handlers) {
        app.stage.off('pointerdown', handlers.down)
        app.stage.off('pointermove', handlers.move)
        app.stage.off('pointerup', handlers.up)
        app.stage.off('pointerupoutside', handlers.up)
        app.stage.off('pointerout', handlers.out)
      }
      pointerHandlersRef.current = null
      app.destroy(true)
      appRef.current = null
      sprites.clear()
    }
  }, [])

  useEffect(() => {
    const app = appRef.current
    if (!app || !commsLayer.current) return

    const stage = app.stage

    drones.forEach(drone => {
      if (!droneSprites.current.has(drone.id)) {
        const container = new PIXI.Container()

        const g = new PIXI.Graphics()
        drawDroneShape(g, drone)
        container.addChild(g)

        const dot = new PIXI.Graphics()
        container.addChild(dot)

        stage.addChild(container)
        droneSprites.current.set(drone.id, container)
      }

      const container = droneSprites.current.get(drone.id)!
      const body = container.children[0] as PIXI.Graphics
      const dot = container.children[1] as PIXI.Graphics

      container.x = drone.x
      container.y = drone.y
      container.rotation = Math.atan2(drone.vy, drone.vx) + Math.PI / 2
      container.alpha = drone.alive ? 1 : 0

      body.clear()
      drawDroneShape(body, drone)

      dot.clear()
      if (drone.alive) {
        if (drone.jammed) {
          dot.circle(0, -10, 3)
          dot.fill({ color: 0xf59e0b })
        } else if (drone.spoofed) {
          dot.circle(0, -10, 3)
          dot.fill({ color: 0xa855f7 })
        }
      }
    })

    droneSprites.current.forEach((sprite, id) => {
      if (!drones.find(d => d.id === id)) {
        stage.removeChild(sprite)
        sprite.destroy()
        droneSprites.current.delete(id)
      }
    })

    const cLayer = commsLayer.current
    cLayer.clear()
    drones.forEach(drone => {
      if (!drone.alive || drone.jammed) return
      drone.comms_links.forEach(linkedId => {
        const target = drones.find(d => d.id === linkedId)
        if (!target || !target.alive) return
        if (drone.id < linkedId) {
          cLayer.moveTo(drone.x, drone.y)
          cLayer.lineTo(target.x, target.y)
        }
      })
    })
    cLayer.stroke({ color: 0x00ff88, width: 0.5, alpha: 0.2 })
  }, [drones])

  return (
    <div
      ref={canvasRef}
      className="rounded border border-wraith-border overflow-hidden"
      style={{ width: WIDTH, height: HEIGHT }}
    />
  )
}

function clampPoint(x: number, y: number) {
  return {
    x: Math.max(0, Math.min(WIDTH, x)),
    y: Math.max(0, Math.min(HEIGHT, y)),
  }
}

function drawAsset(
  g: PIXI.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
  ringAlpha: number,
  centerAlpha: number,
  preview = false,
) {
  g.circle(x, y, radius)
  g.stroke({ color, width: preview ? 1.5 : 1, alpha: ringAlpha })
  g.circle(x, y, preview ? 7 : 5)
  g.fill({ color, alpha: centerAlpha })
}

function drawDroneShape(g: PIXI.Graphics, drone: Drone) {
  if (!drone.alive) return

  const color = drone.jammed ? 0xf59e0b
    : drone.spoofed ? 0xa855f7
    : drone.team === 'red' ? 0xff4444
    : 0x4a9eff

  g.poly([0, -7, 5, 5, -5, 5])
  g.fill({ color, alpha: 0.9 })
  g.poly([0, -7, 5, 5, -5, 5])
  g.stroke({ color: 0xffffff, width: 0.5, alpha: 0.3 })
}

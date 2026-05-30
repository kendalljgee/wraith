import { useEffect, useRef } from 'react'
import { useStore } from '../store/battleStore'
import type {
  DefenseAsset,
  DefenseAssetType,
  DefenseUpgrade,
  DefenseUpgrades,
  Drone,
  Generation,
} from '../store/battleStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8001'

type StateMessage = {
  type: 'state'
  drones: Drone[]
  defense_assets?: DefenseAsset[]
  defense_upgrades?: DefenseUpgrades
}

type GenerationMessage = {
  type: 'generation'
  generation: Generation | { type: 'complete'; generation: number }
}

type HydrateMessage = {
  type: 'hydrate'
  history: Generation[]
}

type BattleMessage = StateMessage | GenerationMessage | HydrateMessage

type PlaceDefenseAssetCommand = {
  type: 'place_defense_asset'
  asset_type: DefenseAssetType
  x: number
  y: number
}

type UpgradeDefenseCommand = {
  type: 'upgrade_defense'
  upgrade: DefenseUpgrade
}

function isCompletionGeneration(
  generation: GenerationMessage['generation'],
): generation is { type: 'complete'; generation: number } {
  return 'type' in generation && generation.type === 'complete'
}

export function useBattleSocket(sessionId: string) {
  const ws = useRef<WebSocket | null>(null)
  const {
    updateDrones,
    addGeneration,
    setThreatLevel,
    setConnected,
    setDefenseAssets,
    setDefenseUpgrades,
    setEvolutionComplete,
  } = useStore()

  useEffect(() => {
    if (!sessionId) return

    ws.current = new WebSocket(`${WS_URL}/ws/battle/${sessionId}`)

    ws.current.onopen = () => setConnected(true)
    ws.current.onclose = () => setConnected(false)

    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data) as BattleMessage
      switch (msg.type) {
        case 'state': {
          updateDrones(msg.drones)
          if (msg.defense_assets) setDefenseAssets(msg.defense_assets)
          if (msg.defense_upgrades) setDefenseUpgrades(msg.defense_upgrades)
          const alive = msg.drones.filter((d) => d.alive).length
          const total = msg.drones.length
          const penetration = 1 - alive / total
          setThreatLevel(
            penetration > 0.5 ? 'CRITICAL' :
            penetration > 0.2 ? 'ELEVATED' : 'LOW'
          )
          return
        }
        case 'generation':
          if (isCompletionGeneration(msg.generation)) {
            // show "Evolution complete" in the panel
            setEvolutionComplete(true)
            return
          }
          return addGeneration(msg.generation)
        case 'hydrate':
          // Restore full history on reconnect
          msg.history.forEach((g) => addGeneration(g))
          return
      }
    }

    ws.current.onerror = (e) => console.error('WRAITH socket error:', e)

    return () => {
      ws.current?.close()
    }
  }, [
    addGeneration,
    sessionId,
    setConnected,
    setDefenseAssets,
    setDefenseUpgrades,
    setEvolutionComplete,
    setThreatLevel,
    updateDrones,
  ])

  return {
    placeDefenseAsset: (asset: Omit<PlaceDefenseAssetCommand, 'type'>) => {
      if (ws.current?.readyState !== WebSocket.OPEN) return false
      ws.current.send(JSON.stringify({ type: 'place_defense_asset', ...asset }))
      return true
    },
    upgradeDefense: (upgrade: Omit<UpgradeDefenseCommand, 'type'>) => {
      if (ws.current?.readyState !== WebSocket.OPEN) return false
      ws.current.send(JSON.stringify({ type: 'upgrade_defense', ...upgrade }))
      return true
    },
  }
}

import { useEffect, useRef } from 'react'
import { useStore } from '../store/battleStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useBattleSocket(sessionId: string) {
  const ws = useRef<WebSocket | null>(null)
  const {
    updateDrones,
    addGeneration,
    setThreatLevel,
    updateCosts,
    setConnected,
    setDefenseAssets,
  } = useStore()

  useEffect(() => {
    if (!sessionId) return

    ws.current = new WebSocket(`${WS_URL}/ws/battle/${sessionId}`)

    ws.current.onopen = () => setConnected(true)
    ws.current.onclose = () => setConnected(false)

    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'state':
          updateDrones(msg.drones)
          if (msg.defense_assets) setDefenseAssets(msg.defense_assets)
          // Derive threat level from swarm penetration
          const alive = msg.drones.filter((d: any) => d.alive).length
          const total = msg.drones.length
          const penetration = 1 - alive / total
          setThreatLevel(
            penetration > 0.5 ? 'CRITICAL' :
            penetration > 0.2 ? 'ELEVATED' : 'LOW'
          )
          return
        case 'generation': return addGeneration(msg.generation)
        case 'costs':      return updateCosts(msg.defender, msg.attacker)
      }
    }

    ws.current.onerror = (e) => console.error('WRAITH socket error:', e)

    return () => ws.current?.close()
  }, [sessionId])
}
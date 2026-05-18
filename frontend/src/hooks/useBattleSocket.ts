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
    setConnected
  } = useStore()

  useEffect(() => {
    if (!sessionId) return

    ws.current = new WebSocket(`${WS_URL}/ws/battle/${sessionId}`)

    ws.current.onopen = () => setConnected(true)
    ws.current.onclose = () => setConnected(false)

    ws.current.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'state':      return updateDrones(msg.drones)
        case 'generation': return addGeneration(msg.generation)
        case 'threat':     return setThreatLevel(msg.level)
        case 'costs':      return updateCosts(msg.defender, msg.attacker)
      }
    }

    ws.current.onerror = (e) => console.error('WRAITH socket error:', e)

    return () => ws.current?.close()
  }, [sessionId])
}
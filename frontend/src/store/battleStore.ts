import { create } from 'zustand'

export interface Drone {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  alive: boolean
  team: 'red' | 'blue'
  comms_links: string[]
}

export interface Generation {
  number: number
  fitness: number
  mutation: string
  isLLM: boolean
  reasoning?: string
}

interface BattleState {
  drones: Drone[]
  generations: Generation[]
  threatLevel: 'LOW' | 'ELEVATED' | 'CRITICAL'
  costDefender: number
  costAttacker: number
  sessionId: string | null
  connected: boolean
  updateDrones: (drones: Drone[]) => void
  addGeneration: (gen: Generation) => void
  setThreatLevel: (level: 'LOW' | 'ELEVATED' | 'CRITICAL') => void
  updateCosts: (defender: number, attacker: number) => void
  setSession: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useStore = create<BattleState>((set) => ({
  drones: [],
  generations: [],
  threatLevel: 'LOW',
  costDefender: 0,
  costAttacker: 0,
  sessionId: null,
  connected: false,
  updateDrones: (drones) => set({ drones }),
  addGeneration: (gen) => set((s) => ({
    generations: [...s.generations.slice(-50), gen] // keep last 50
  })),
  setThreatLevel: (threatLevel) => set({ threatLevel }),
  updateCosts: (costDefender, costAttacker) => set({ costDefender, costAttacker }),
  setSession: (sessionId) => set({ sessionId }),
  setConnected: (connected) => set({ connected }),
}))
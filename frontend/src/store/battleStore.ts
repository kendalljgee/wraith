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
  jammed: boolean
  spoofed: boolean
}

export type DefenseAssetType = 'jammer' | 'interceptor' | 'spoofer'

export interface DefenseAsset {
  id: string
  x: number
  y: number
  type: DefenseAssetType
  radius: number
  active: boolean
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
  defenseAssets: DefenseAsset[]
  generations: Generation[]
  threatLevel: 'LOW' | 'ELEVATED' | 'CRITICAL'
  costDefender: number
  costAttacker: number
  sessionId: string | null
  connected: boolean
  evolutionComplete: boolean
  setEvolutionComplete: (v: boolean) => void
  updateDrones: (drones: Drone[]) => void
  setDefenseAssets: (assets: DefenseAsset[]) => void
  addDefenseAsset: (asset: DefenseAsset) => void
  addGeneration: (gen: Generation) => void
  setThreatLevel: (level: 'LOW' | 'ELEVATED' | 'CRITICAL') => void
  updateCosts: (defender: number, attacker: number) => void
  setSession: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useStore = create<BattleState>((set) => ({
  drones: [],
  defenseAssets: [],
  generations: [],
  threatLevel: 'LOW',
  costDefender: 0,
  costAttacker: 0,
  sessionId: null,
  connected: false,
  evolutionComplete: false,
  updateDrones: (drones) => set({ drones }),
  setDefenseAssets: (defenseAssets) => set({ defenseAssets }),
  addGeneration: (gen) => set((s) => ({
    generations: [...s.generations.slice(-50), gen] // keep last 50
  })),
  setThreatLevel: (threatLevel) => set({ threatLevel }),
  updateCosts: (costDefender, costAttacker) => set({ costDefender, costAttacker }),
  setSession: (sessionId) => set({ sessionId }),
  setConnected: (connected) => set({ connected }),
  setEvolutionComplete: (v: boolean) => set({ evolutionComplete: v }),
  addDefenseAsset: (asset) => set((s) => ({ defenseAssets: [...s.defenseAssets, asset] })),
}))

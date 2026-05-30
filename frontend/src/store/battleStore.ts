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
  reload_time?: number
}

export interface Generation {
  number: number
  fitness: number
  mutation: string
  isLLM: boolean
  reasoning?: string
}

export type DefenseUpgrade = 'ew_range' | 'interceptor_readiness' | 'sensor_fusion'

export type DefenseUpgrades = Record<DefenseUpgrade, number>

interface BattleState {
  drones: Drone[]
  defenseAssets: DefenseAsset[]
  defenseUpgrades: DefenseUpgrades
  generations: Generation[]
  threatLevel: 'LOW' | 'ELEVATED' | 'CRITICAL'
  sessionId: string | null
  connected: boolean
  evolutionComplete: boolean
  setEvolutionComplete: (v: boolean) => void
  updateDrones: (drones: Drone[]) => void
  setDefenseAssets: (assets: DefenseAsset[]) => void
  setDefenseUpgrades: (upgrades: DefenseUpgrades) => void
  addDefenseAsset: (asset: DefenseAsset) => void
  addGeneration: (gen: Generation) => void
  setThreatLevel: (level: 'LOW' | 'ELEVATED' | 'CRITICAL') => void
  setSession: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useStore = create<BattleState>((set) => ({
  drones: [],
  defenseAssets: [],
  defenseUpgrades: {
    ew_range: 0,
    interceptor_readiness: 0,
    sensor_fusion: 0,
  },
  generations: [],
  threatLevel: 'LOW',
  sessionId: null,
  connected: false,
  evolutionComplete: false,
  updateDrones: (drones) => set({ drones }),
  setDefenseAssets: (defenseAssets) => set({ defenseAssets }),
  setDefenseUpgrades: (defenseUpgrades) => set({ defenseUpgrades }),
  addGeneration: (gen) => set((s) => ({
    generations: [...s.generations.slice(-50), gen] // keep last 50
  })),
  setThreatLevel: (threatLevel) => set({ threatLevel }),
  setSession: (sessionId) => set({ sessionId }),
  setConnected: (connected) => set({ connected }),
  setEvolutionComplete: (v: boolean) => set({ evolutionComplete: v }),
  addDefenseAsset: (asset) => set((s) => ({ defenseAssets: [...s.defenseAssets, asset] })),
}))

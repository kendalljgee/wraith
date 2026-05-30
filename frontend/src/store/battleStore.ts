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
  name?: string
  x: number
  y: number
  type: DefenseAssetType
  radius: number
  active: boolean
  reload_time?: number
}

export interface TerrainZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: 'urban' | 'ridge' | 'rf_shadow'
  label: string
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
  terrainZones: TerrainZone[]
  generations: Generation[]
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  sessionId: string | null
  connected: boolean
  evolutionComplete: boolean
  setEvolutionComplete: (v: boolean) => void
  updateDrones: (drones: Drone[]) => void
  setDefenseAssets: (assets: DefenseAsset[]) => void
  setDefenseUpgrades: (upgrades: DefenseUpgrades) => void
  addDefenseAsset: (asset: DefenseAsset) => void
  moveDefenseAsset: (id: string, x: number, y: number) => void
  removeDefenseAsset: (id: string) => void
  incrementDefenseUpgrade: (upgrade: DefenseUpgrade) => void
  setTerrainZones: (zones: TerrainZone[]) => void
  addGeneration: (gen: Generation) => void
  clearGenerations: () => void
  resetScenario: () => void
  setThreatLevel: (level: 'LOW' | 'MEDIUM' | 'HIGH') => void
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
  terrainZones: [],
  generations: [],
  threatLevel: 'LOW',
  sessionId: null,
  connected: false,
  evolutionComplete: false,
  updateDrones: (drones) => set({ drones }),
  setDefenseAssets: (defenseAssets) => set({ defenseAssets }),
  setDefenseUpgrades: (defenseUpgrades) => set({ defenseUpgrades }),
  moveDefenseAsset: (id, x, y) => set((s) => ({
    defenseAssets: s.defenseAssets.map((asset) => (
      asset.id === id ? { ...asset, x, y } : asset
    )),
  })),
  removeDefenseAsset: (id) => set((s) => ({
    defenseAssets: s.defenseAssets.filter((asset) => asset.id !== id),
  })),
  incrementDefenseUpgrade: (upgrade) => set((s) => ({
    defenseUpgrades: {
      ...s.defenseUpgrades,
      [upgrade]: Math.min(3, s.defenseUpgrades[upgrade] + 1),
    },
  })),
  setTerrainZones: (terrainZones) => set({ terrainZones }),
  addGeneration: (gen) => set((s) => ({
    generations: [...s.generations.slice(-50), gen] // keep last 50
  })),
  clearGenerations: () => set({
    generations: [],
    evolutionComplete: false,
  }),
  resetScenario: () => set({
    drones: [],
    defenseAssets: [],
    defenseUpgrades: {
      ew_range: 0,
      interceptor_readiness: 0,
      sensor_fusion: 0,
    },
    terrainZones: [],
    generations: [],
    threatLevel: 'LOW',
    evolutionComplete: false,
  }),
  setThreatLevel: (threatLevel) => set({ threatLevel }),
  setSession: (sessionId) => set({ sessionId }),
  setConnected: (connected) => set({ connected }),
  setEvolutionComplete: (v: boolean) => set({ evolutionComplete: v }),
  addDefenseAsset: (asset) => set((s) => ({ defenseAssets: [...s.defenseAssets, asset] })),
}))

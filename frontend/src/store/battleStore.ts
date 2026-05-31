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
  decoyed?: boolean
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
  effectiveness?: number
}

export interface TerrainZone {
  id: string
  x: number
  y: number
  width: number
  height: number
  type: 'urban' | 'ridge' | 'rf_shadow' | 'desert' | 'water'
  label: string
}

export interface Generation {
  number: number
  fitness: number
  mutation: string
  isLLM: boolean
  reasoning?: string
  metrics?: {
    active_drones?: number
    disabled_drones?: number
    total_drones?: number
    objective_reached?: boolean
    closest_to_objective_m?: number
    time_elapsed_s?: number
  }
}

export type ThreatLevel = 'STANDOFF' | 'APPROACH' | 'DANGER' | 'TERMINAL' | 'BREACH'

interface BattleState {
  drones: Drone[]
  defenseAssets: DefenseAsset[]
  terrainZones: TerrainZone[]
  generations: Generation[]
  battleDebrief: string | null
  threatLevel: ThreatLevel
  sessionId: string | null
  connected: boolean
  evolutionComplete: boolean
  setEvolutionComplete: (v: boolean) => void
  updateDrones: (drones: Drone[]) => void
  setDefenseAssets: (assets: DefenseAsset[]) => void
  addDefenseAsset: (asset: DefenseAsset) => void
  moveDefenseAsset: (id: string, x: number, y: number) => void
  removeDefenseAsset: (id: string) => void
  setTerrainZones: (zones: TerrainZone[]) => void
  addGeneration: (gen: Generation) => void
  clearGenerations: () => void
  setBattleDebrief: (debrief: string | null) => void
  resetScenario: () => void
  setThreatLevel: (level: ThreatLevel) => void
  setSession: (id: string) => void
  setConnected: (connected: boolean) => void
}

export const useStore = create<BattleState>((set) => ({
  drones: [],
  defenseAssets: [],
  terrainZones: [],
  generations: [],
  battleDebrief: null,
  threatLevel: 'STANDOFF',
  sessionId: null,
  connected: false,
  evolutionComplete: false,
  updateDrones: (drones) => set({ drones }),
  setDefenseAssets: (defenseAssets) => set({ defenseAssets }),
  moveDefenseAsset: (id, x, y) => set((s) => ({
    defenseAssets: s.defenseAssets.map((asset) => (
      asset.id === id ? { ...asset, x, y } : asset
    )),
  })),
  removeDefenseAsset: (id) => set((s) => ({
    defenseAssets: s.defenseAssets.filter((asset) => asset.id !== id),
  })),
  setTerrainZones: (terrainZones) => set({ terrainZones }),
  addGeneration: (gen) => set((s) => ({
    generations: [...s.generations.slice(-50), gen] // keep last 50
  })),
  clearGenerations: () => set({
    generations: [],
    evolutionComplete: false,
  }),
  setBattleDebrief: (battleDebrief) => set({ battleDebrief }),
  resetScenario: () => set({
    drones: [],
    defenseAssets: [],
    terrainZones: [],
    generations: [],
    battleDebrief: null,
    threatLevel: 'STANDOFF',
    evolutionComplete: false,
  }),
  setThreatLevel: (threatLevel) => set({ threatLevel }),
  setSession: (sessionId) => set({ sessionId }),
  setConnected: (connected) => set({ connected }),
  setEvolutionComplete: (v: boolean) => set({ evolutionComplete: v }),
  addDefenseAsset: (asset) => set((s) => ({ defenseAssets: [...s.defenseAssets, asset] })),
}))

import { useState } from 'react'
import EvolutionPanel from './components/EvolutionPanel'
import { useBattleSocket } from './hooks/useBattleSocket'
import BattleCanvas from './renderer/BattleCanvas'
import { useStore } from './store/battleStore'
import type { DefenseAssetType } from './store/battleStore'

const SESSION_ID = 'dev-session-001'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const ASSET_TOOLS: Array<{
  type: DefenseAssetType
  label: string
  color: string
  radius: number
  reload_time: number
  effectiveness: number
}> = [
  { type: 'jammer', label: 'Jammer', color: '#f59e0b', radius: 110, reload_time: 0, effectiveness: 0.82 },
  { type: 'interceptor', label: 'Interceptor', color: '#ef4444', radius: 60, reload_time: 2, effectiveness: 0.75 },
  { type: 'spoofer', label: 'Spoofer', color: '#a855f7', radius: 110, reload_time: 0, effectiveness: 0.72 },
]

type AssetSpec = {
  id: string
  name: string
  type: DefenseAssetType
  radius: number
  reload_time?: number
  effectiveness?: number
  latency_ms?: number
}

type ImportedAssetSpec = Partial<AssetSpec> & {
  range_m?: number
  reload_s?: number
  pk?: number
}

const threatColors = {
  BREACH: 'text-threat-critical',
  TERMINAL: 'text-red-400',
  DANGER: 'text-threat-elevated',
  APPROACH: 'text-amber-300',
  STANDOFF: 'text-threat-low',
}

export default function App() {
  const {
    threatLevel,
    connected,
    drones,
    defenseAssets,
    addDefenseAsset,
    moveDefenseAsset,
    removeDefenseAsset,
    resetScenario,
  } = useStore()
  const {
    placeDefenseAsset,
    moveDefenseAsset: sendMoveDefenseAsset,
    removeDefenseAsset: sendRemoveDefenseAsset,
    describeTerrain,
  } = useBattleSocket(SESSION_ID)

  const active = drones.filter(d => d.alive && !d.jammed && !d.spoofed).length
  const disabled = drones.filter(d => !d.alive || d.jammed || d.spoofed).length
  const total = drones.length
  const [challengeActive, setChallengeActive] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<DefenseAssetType>('jammer')
  const [paused, setPaused] = useState(false)
  const [removeMode, setRemoveMode] = useState(false)
  const [customSpecs, setCustomSpecs] = useState<AssetSpec[]>([])
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null)
  const [terrainPrompt, setTerrainPrompt] = useState('')
  const [specRadius, setSpecRadius] = useState(ASSET_TOOLS[0].radius)
  const [specReload, setSpecReload] = useState(ASSET_TOOLS[0].reload_time)
  const [specEffectiveness, setSpecEffectiveness] = useState(ASSET_TOOLS[0].effectiveness)
  const [specLatency, setSpecLatency] = useState(0)

  const selectedSpec = customSpecs.find(spec => spec.id === selectedSpecId)
  const selectedTool = selectedSpec || ASSET_TOOLS.find(tool => tool.type === selectedAsset)!
  const selectedName = 'name' in selectedTool ? selectedTool.name : selectedTool.label
  const selectedRadius = Math.max(1, specRadius || selectedTool.radius)
  const selectedReload = Math.max(0, specReload || 0)
  const selectedEffectiveness = Math.max(0, Math.min(1, specEffectiveness || 0))

  async function enterChallenge() {
    setChallengeActive(true)
    setPaused(true)
    await fetch(`${API_URL}/api/battle/pause`, { method: 'POST' })
    await fetch(`${API_URL}/api/tournament/pause`, { method: 'POST' })
  }

  async function runDefense() {
    setChallengeActive(false)
    setPaused(false)
    await fetch(`${API_URL}/api/battle/resume`, { method: 'POST' })
    await fetch(`${API_URL}/api/tournament/restart`, { method: 'POST' })
  }

  async function togglePause() {
    const nextPaused = !paused
    setPaused(nextPaused)
    await fetch(`${API_URL}/api/battle/${nextPaused ? 'pause' : 'resume'}`, { method: 'POST' })
    await fetch(`${API_URL}/api/tournament/${nextPaused ? 'pause' : 'resume'}`, { method: 'POST' })
  }

  async function resetAll() {
    setPaused(false)
    setChallengeActive(false)
    setRemoveMode(false)
    setTerrainPrompt('')
    resetScenario()
    await fetch(`${API_URL}/api/system/reset`, { method: 'POST' })
  }

  function selectAssetTool(type: DefenseAssetType) {
    const tool = ASSET_TOOLS.find(candidate => candidate.type === type)!
    setSelectedAsset(type)
    setSelectedSpecId(null)
    setRemoveMode(false)
    loadSpec(tool)
  }

  function loadSpec(spec: Pick<AssetSpec, 'type' | 'radius'> & {
    reload_time?: number
    effectiveness?: number
    latency_ms?: number
  }) {
    setSelectedAsset(spec.type)
    setSpecRadius(spec.radius)
    setSpecReload(spec.reload_time ?? 0)
    setSpecEffectiveness(spec.effectiveness ?? 0.75)
    setSpecLatency(spec.latency_ms ?? 0)
  }

  async function importAssetSpecs(file: File | null) {
    if (!file) return
    const text = await file.text()
    const parsed = JSON.parse(text) as Array<ImportedAssetSpec>
    const specs: AssetSpec[] = []

    parsed.forEach((spec, index) => {
      const radius = typeof spec.radius === 'number' ? spec.radius : spec.range_m
      const reloadTime = typeof spec.reload_time === 'number' ? spec.reload_time : spec.reload_s
      const effectiveness = typeof spec.effectiveness === 'number' ? spec.effectiveness : spec.pk

      if (
        typeof spec.name !== 'string'
        || (spec.type !== 'jammer' && spec.type !== 'interceptor' && spec.type !== 'spoofer')
        || typeof radius !== 'number'
      ) {
        return
      }

      specs.push({
        id: spec.id || `spec_${Date.now()}_${index}`,
        name: spec.name,
        type: spec.type,
        radius,
        reload_time: reloadTime,
        effectiveness,
        latency_ms: spec.latency_ms,
      })
    })

    setCustomSpecs(specs)
    if (specs[0]) {
      setSelectedSpecId(specs[0].id)
      loadSpec(specs[0])
      setRemoveMode(false)
    }
  }

  function applyTerrainPrompt() {
    if (!terrainPrompt.trim()) return
    describeTerrain({ description: terrainPrompt })
  }

  return (
    <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-4">
      <div className="border border-wraith-border rounded p-3 mb-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-widest">
            Autonomous Red Team System
          </span>
          <h1 className="text-lg font-medium text-slate-100 mt-0.5">WRAITH</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={togglePause}
            className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>

          <button
            onClick={resetAll}
            className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            Reset
          </button>

          {challengeActive ? (
            <button
              onClick={runDefense}
              className="text-xs border border-threat-low rounded px-2 py-1 text-threat-low hover:text-slate-100 transition-colors"
            >
              Run Defense
            </button>
          ) : (
            <button
              onClick={enterChallenge}
              className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors"
            >
              Add Assets
            </button>
          )}

          <div className="flex items-center gap-2 text-xs">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-threat-low' : 'bg-threat-critical'
              }`}
            />
            <span className="text-slate-500">
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-xs mb-4">
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Threat Level</div>
          <div className={`font-medium text-sm ${threatColors[threatLevel]}`}>{threatLevel}</div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Drones Active</div>
          <div className="text-slate-200 text-sm">
            {active}<span className="text-slate-500">/{total}</span>
          </div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Drones Disabled</div>
          <div className="text-slate-200 text-sm">{disabled}</div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Defense Assets</div>
          <div className="text-slate-200 text-sm">{defenseAssets.length}</div>
        </div>
      </div>

      {challengeActive && (
        <div className="border border-wraith-border rounded p-3 mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {ASSET_TOOLS.map(tool => (
              <button
                key={tool.type}
                onClick={() => selectAssetTool(tool.type)}
                className={`text-xs border rounded px-2 py-1 transition-colors ${
                  selectedAsset === tool.type
                    ? 'border-slate-300 text-slate-100'
                    : 'border-wraith-border text-slate-500 hover:text-slate-200'
                }`}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: tool.color }}
                />{' '}
                {tool.label}
              </button>
            ))}
            {customSpecs.map(spec => (
              <button
                key={spec.id}
                onClick={() => {
                  setSelectedSpecId(spec.id)
                  setRemoveMode(false)
                  loadSpec(spec)
                }}
                className={`text-xs border rounded px-2 py-1 transition-colors ${
                  selectedSpecId === spec.id
                    ? 'border-slate-300 text-slate-100'
                    : 'border-wraith-border text-slate-500 hover:text-slate-200'
                }`}
              >
                {spec.name}
              </button>
            ))}
            <button
              onClick={() => setRemoveMode(true)}
              className={`text-xs border rounded px-2 py-1 transition-colors ${
                removeMode
                  ? 'border-threat-critical text-threat-critical'
                  : 'border-wraith-border text-slate-500 hover:text-slate-200'
              }`}
            >
              Remove
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Range
              <input
                type="number"
                min="1"
                value={specRadius}
                onChange={(event) => setSpecRadius(Number(event.target.value))}
                className="w-20 bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-300"
              />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Reload
              <input
                type="number"
                min="0"
                step="0.1"
                value={specReload}
                onChange={(event) => setSpecReload(Number(event.target.value))}
                className="w-20 bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-300"
              />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Effect
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={specEffectiveness}
                onChange={(event) => setSpecEffectiveness(Number(event.target.value))}
                className="w-20 bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-300"
              />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              Latency
              <input
                type="number"
                min="0"
                value={specLatency}
                onChange={(event) => setSpecLatency(Number(event.target.value))}
                className="w-20 bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-300"
              />
            </label>
            <input
              value={terrainPrompt}
              onChange={(event) => setTerrainPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyTerrainPrompt()
              }}
              placeholder="Specify terrain type or location"
              className="w-72 text-xs bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-300 placeholder:text-slate-600"
            />
            <button
              onClick={applyTerrainPrompt}
              className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 transition-colors"
            >
              Apply Terrain
            </button>
            <label className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 transition-colors">
              Import Specs
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  void importAssetSpecs(event.target.files?.[0] || null)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <div className="shrink-0">
          <BattleCanvas
            mode={challengeActive ? 'challenge' : 'spectator'}
            selectedAsset={selectedAsset}
            previewRadius={selectedRadius}
            removeMode={removeMode}
            onPlaceAsset={(asset) => {
              placeDefenseAsset({
                id: asset.id,
                name: selectedName,
                asset_type: asset.type,
                x: asset.x,
                y: asset.y,
                radius: selectedRadius,
                reload_time: selectedReload,
                effectiveness: selectedEffectiveness,
              })

              addDefenseAsset({
                id: asset.id,
                name: selectedName,
                x: asset.x,
                y: asset.y,
                type: asset.type,
                radius: selectedRadius,
                active: true,
                reload_time: selectedReload,
                effectiveness: selectedEffectiveness,
              })
            }}
            onMoveAsset={(asset) => {
              moveDefenseAsset(asset.id, asset.x, asset.y)
              sendMoveDefenseAsset(asset)
            }}
            onRemoveAsset={(asset) => {
              removeDefenseAsset(asset.id)
              sendRemoveDefenseAsset(asset)
            }}
          />
          <div className="flex gap-6 mt-3 text-xs text-slate-500">
            <span><span className="text-red-400">▲</span> Attacker Drone</span>
            <span><span className="text-amber-400">▲</span> Jammed</span>
            <span><span className="text-purple-400">▲</span> Spoofed</span>
            <span><span className="text-emerald-400">—</span> Comms Link</span>
          </div>
        </div>

        <div className="flex-1" style={{ height: '600px' }}>
          <EvolutionPanel challengeActive={challengeActive} />
        </div>
      </div>
    </div>
  )
}

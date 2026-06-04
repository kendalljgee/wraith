import { useEffect, useState } from 'react'
import EvolutionPanel from './components/EvolutionPanel'
import { useBattleSocket } from './hooks/useBattleSocket'
import BattleCanvas from './renderer/BattleCanvas'
import { useStore } from './store/battleStore'
import type { DefenseAssetType } from './store/battleStore'

const SESSION_ID = 'dev-session-001'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'
const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const TERRAIN_PROMPTS = [
  'terrain like Kabul, Afghanistan',
  'terrain like Kyiv, Ukraine',
  'mountain valley with RF shadow zones',
  'open desert basin with low-rise urban grid',
]

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

type Page = 'landing' | 'simulation' | 'debrief'

const pagePaths: Record<Page, string> = {
  landing: '/',
  simulation: '/simulation',
  debrief: '/debrief',
}

function pageFromPath(pathname: string): Page {
  if (pathname.startsWith('/simulation')) return 'simulation'
  if (pathname.startsWith('/debrief')) return 'debrief'
  return 'landing'
}

export default function App() {
  const {
    threatLevel,
    connected,
    drones,
    defenseAssets,
    battleDebrief,
    setBattleDebrief,
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
    setSpeed: sendSpeed,
  } = useBattleSocket(SESSION_ID)

  const active = drones.filter(d => d.alive && !d.jammed && !d.spoofed).length
  const disabled = drones.filter(d => !d.alive || d.jammed || d.spoofed).length
  const total = drones.length
  const [challengeActive, setChallengeActive] = useState(true)
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname))
  const [selectedAsset, setSelectedAsset] = useState<DefenseAssetType>('jammer')
  const [paused, setPaused] = useState(true)
  const [removeMode, setRemoveMode] = useState(false)
  const [battleSpeed, setBattleSpeed] = useState(1)
  const [debriefPromptDismissed, setDebriefPromptDismissed] = useState(false)
  const [debriefPromptPending, setDebriefPromptPending] = useState(false)
  const [battleHasStarted, setBattleHasStarted] = useState(false)
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

  async function apiFetch(path: string, init?: RequestInit) {
    try {
      return await fetch(`${API_URL}${path}`, init)
    } catch (error) {
      console.error(`WRAITH API request failed: ${path}`, error)
      return null
    }
  }

  useEffect(() => {
    function handlePopState() {
      setPage(pageFromPath(window.location.pathname))
      window.scrollTo({ top: 0 })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateTo(nextPage: Page) {
    setPage(nextPage)
    window.history.pushState({}, '', pagePaths[nextPage])
    window.scrollTo({ top: 0 })
  }

  async function runDefense() {
    setChallengeActive(false)
    setPaused(false)
    setBattleHasStarted(true)
    setBattleDebrief(null)
    setDebriefPromptDismissed(false)
    setDebriefPromptPending(false)
    await apiFetch('/api/battle/resume', { method: 'POST' })
    await apiFetch(`/api/tournament/restart?session_id=${SESSION_ID}`, { method: 'POST' })
  }

  function endSimulation() {
    setBattleHasStarted(true)
    setPaused(true)
    setDebriefPromptDismissed(false)
    setDebriefPromptPending(true)
    void apiFetch(`/api/battle/end?session_id=${SESSION_ID}`, { method: 'POST' })
  }

  async function togglePause() {
    const nextPaused = !paused
    setPaused(nextPaused)
    await apiFetch(`/api/battle/${nextPaused ? 'pause' : 'resume'}`, { method: 'POST' })
    await apiFetch(`/api/tournament/${nextPaused ? 'pause' : 'resume'}`, { method: 'POST' })
  }

  async function resetAll() {
    setPaused(true)
    setChallengeActive(true)
    setRemoveMode(false)
    setDebriefPromptDismissed(false)
    setDebriefPromptPending(false)
    setBattleHasStarted(false)
    setTerrainPrompt('')
    resetScenario()
    await apiFetch('/api/system/reset', { method: 'POST' })
  }

  async function startSimulation() {
    await resetAll()
    navigateTo('simulation')
  }

  async function goHome() {
    navigateTo('landing')
    setPaused(true)
    setChallengeActive(true)
    setBattleHasStarted(false)
    setDebriefPromptPending(false)
    void apiFetch('/api/battle/pause', { method: 'POST' })
    void apiFetch('/api/tournament/pause', { method: 'POST' })
  }

  async function returnToResetSimulation() {
    await resetAll()
    navigateTo('simulation')
  }

  async function updateBattleSpeed(speed: number) {
    setBattleSpeed(speed)
    sendSpeed({ speed })
    await apiFetch(`/api/battle/speed?speed=${speed}`, { method: 'POST' })
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

  if (page === 'landing') {
    return (
      <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-6">
        <main className="mx-auto max-w-6xl">
          <section className="py-6">
            <div className="mb-8">
              <div className="text-xs text-slate-500 uppercase tracking-[0.35em] mb-3">
                Autonomous Red Team System
              </div>
              <h1 className="text-6xl md:text-7xl font-semibold text-slate-50 tracking-normal">WRAITH</h1>
              <p className="text-2xl md:text-3xl text-slate-300 mt-4 max-w-4xl leading-tight">
                Test counter-UAS asset placement against adaptive attacker swarm behavior.
              </p>
            </div>

            <div className="border border-wraith-border rounded p-5">
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <InstructionBlock
                  title="1. Build Defense"
                  items={[
                    { label: 'Select', detail: 'Jammer, Interceptor, or Spoofer.' },
                    { label: 'Place', detail: 'Hover to preview range. Click map to add.' },
                    { label: 'Move', detail: 'Drag from the center dot.' },
                    { label: 'Remove', detail: 'Enable Remove, then click an asset center.' },
                  ]}
                />
                <InstructionBlock
                  title="2. Tune Asset Specs"
                  items={[
                    { label: 'Range', detail: 'meters of coverage.' },
                    { label: 'Reload', detail: 'seconds between interceptor shots.' },
                    { label: 'Effect', detail: 'probability or EW reliability from 0 to 1.' },
                    { label: 'Latency', detail: 'response delay metadata for imported assets.' },
                  ]}
                />
                <InstructionBlock
                  title="3. Generate Terrain"
                  variant="bullets"
                  items={[
                    { detail: 'Enter a terrain description or location.' },
                    { detail: 'WRAITH creates tactical terrain zones on the simulation map.' },
                  ]}
                />
                <InstructionBlock
                  title="4. Run Battle"
                  variant="bullets"
                  items={[
                    { detail: 'To start the simulation, click Run Defense after placing assets.' },
                    { detail: 'The attacker swarm adapts across generations.' },
                    { detail: 'The simulation ends on breach, timeout, swarm destruction, or full jamming/spoofing.' },
                  ]}
                />
              </div>

              <div className="mt-5 grid md:grid-cols-3 gap-3 text-xs">
                <VisualKey color="bg-amber-400" label="Jammer" detail="Severs comms inside range." />
                <VisualKey color="bg-red-400" label="Interceptor" detail="Destroys drones inside range." />
                <VisualKey color="bg-purple-400" label="Spoofer" detail="Redirects drone navigation." />
              </div>

              <div className="mt-5 border border-wraith-border rounded p-3">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Sample Terrain Prompts</div>
                <div className="grid md:grid-cols-2 gap-2">
                  {TERRAIN_PROMPTS.map(prompt => (
                    <div key={prompt} className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-300">
                      {prompt}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid md:grid-cols-[minmax(240px,0.45fr)_1fr] gap-5 items-stretch">
              <div className="border border-wraith-border rounded p-4 flex items-center justify-center gap-3">
                <label className="text-sm border border-wraith-border rounded px-5 py-2 text-slate-300 hover:text-slate-100 hover:border-slate-500 transition-colors cursor-pointer">
                  Import Custom Specs
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
                <div className="relative group">
                  <div className="w-6 h-6 rounded-full border border-wraith-border text-slate-400 flex items-center justify-center text-xs">i</div>
                  <div className="hidden group-hover:block absolute bottom-8 right-0 w-80 border border-wraith-border rounded bg-wraith-bg p-3 text-xs text-slate-300 z-10">
                    Import a JSON array. Each item needs name, type: jammer/interceptor/spoofer, and radius or range_m. Optional fields: reload_time or reload_s, effectiveness or pk, latency_ms.
                  </div>
                </div>
              </div>

              <div className="border border-wraith-border rounded p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Imported Assets</div>
                {customSpecs.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {customSpecs.map(spec => (
                      <div key={spec.id} className="border border-wraith-border rounded px-3 py-2 text-xs flex items-center justify-between gap-3">
                        <span className="text-slate-200">{spec.name}</span>
                        <span className="text-slate-500">{spec.type} · {spec.radius}m</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 border border-wraith-border rounded px-3 py-3">
                    No custom asset specs imported yet.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-7 flex justify-center">
              <button
                onClick={() => void startSimulation()}
                className="text-sm bg-threat-low text-wraith-bg border border-threat-low rounded px-5 py-2 hover:bg-slate-100 hover:border-slate-100 transition-colors"
              >
                Start Simulation
              </button>
            </div>
          </section>
        </main>
      </div>
    )
  }

  if (page === 'debrief') {
    return (
      <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-4">
        <button
          onClick={() => void goHome()}
          className="mb-4 text-xs border border-wraith-border rounded px-3 py-2 text-slate-400 hover:text-slate-100"
        >
          Home
        </button>
        <div className="grid lg:grid-cols-[460px_minmax(0,1fr)] gap-5 mr-4">
          <div>
            <div className="border border-wraith-border rounded p-4">
              <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Defense Layout</div>
              <DefenseLayoutPreview assets={defenseAssets} />
            </div>
            <button
              onClick={() => void returnToResetSimulation()}
              className="mt-4 text-sm bg-threat-low text-wraith-bg border border-threat-low rounded px-5 py-2 hover:bg-slate-100 hover:border-slate-100 transition-colors"
            >
              Run New Simulation
            </button>
          </div>
          <div className="border border-wraith-border rounded p-5">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">AI Battle Debrief</div>
            <h1 className="text-3xl text-slate-50 mb-4">Engagement Summary</h1>
            <DebriefContent text={battleDebrief} loading={!battleDebrief && debriefPromptPending} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-4">
      <div className="border border-wraith-border rounded p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => void goHome()}
            className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            Home
          </button>
          <div>
          <span className="text-xs text-slate-500 uppercase tracking-widest">
            Autonomous Red Team System
          </span>
          <h1 className="text-lg font-medium text-slate-100 mt-0.5">WRAITH</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={togglePause}
            className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>

          <select
            value={battleSpeed}
            onChange={(event) => void updateBattleSpeed(Number(event.target.value))}
            className="text-xs bg-transparent border border-wraith-border rounded px-2 py-1 text-slate-400"
          >
            {SPEED_OPTIONS.map(speed => (
              <option key={speed} value={speed}>{speed}x</option>
            ))}
          </select>

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
              onClick={() => void endSimulation()}
              className="text-xs border border-threat-critical rounded px-2 py-1 text-threat-critical hover:text-slate-100 hover:border-slate-100 transition-colors"
            >
              End Simulation
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

      <div className={`border border-wraith-border rounded p-3 mb-4 flex items-center justify-between gap-4 min-h-[82px] transition-opacity ${
        challengeActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
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

        <div className="flex-1 min-w-0" style={{ height: '600px' }}>
          <EvolutionPanel challengeActive={challengeActive} />
        </div>
      </div>
      {battleHasStarted && (battleDebrief || debriefPromptPending) && !debriefPromptDismissed && (active === 0 || paused) && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="border border-wraith-border rounded bg-wraith-bg p-5 max-w-md w-full">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              {battleDebrief ? 'Battle Complete' : 'Ending Simulation'}
            </div>
            <h2 className="text-xl text-slate-100 mb-3">View the AI debrief?</h2>
            <p className="text-sm text-slate-400 mb-5">
              {battleDebrief
                ? 'WRAITH generated an after-action summary of the terrain, asset placement, battle outcome, and recommendations.'
                : 'WRAITH is freezing the current battle state and generating the after-action summary now.'}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDebriefPromptDismissed(true)
                  setDebriefPromptPending(false)
                }}
                className="text-xs border border-wraith-border rounded px-3 py-2 text-slate-400 hover:text-slate-100"
              >
                Stay Here
              </button>
              <button
                onClick={() => {
                  navigateTo('debrief')
                }}
                className="text-xs bg-threat-low text-wraith-bg border border-threat-low rounded px-3 py-2 hover:bg-slate-100 transition-colors"
              >
                {battleDebrief ? 'See Debrief' : 'Open Debrief'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InstructionBlock({ title, items, variant = 'definitions' }: {
  title: string
  items: Array<{ label?: string; detail: string }>
  variant?: 'definitions' | 'bullets'
}) {
  return (
    <div className="border border-wraith-border rounded p-3">
      <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={`${item.label || ''}-${item.detail}`} className={`leading-5 text-slate-300 ${
            variant === 'bullets' ? 'flex gap-2' : 'flex gap-2'
          }`}>
            {variant === 'bullets' && <span className="text-slate-500">•</span>}
            {variant === 'bullets' ? (
              <span>{item.detail}</span>
            ) : (
              <span>
                <span className="text-slate-100 font-semibold">{item.label}</span>
                <span className="text-slate-500">: </span>
                {item.detail}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function VisualKey({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <div className="border border-wraith-border rounded p-3">
      <div className="flex items-center gap-2 text-slate-100 mb-1">
        <span className={`w-3 h-3 rounded-full ${color}`} />
        {label}
      </div>
      <div className="text-slate-500">{detail}</div>
    </div>
  )
}

function DebriefContent({ text, loading = false }: { text: string | null; loading?: boolean }) {
  if (loading) {
    return (
      <div className="border border-wraith-border rounded p-5 bg-wraith-panel/20">
        <div className="text-xs uppercase tracking-widest text-slate-500 mb-3">Generating Debrief</div>
        <div className="space-y-3">
          <div className="h-3 w-2/3 rounded bg-slate-700/60 animate-pulse" />
          <div className="h-3 w-full rounded bg-slate-800/70 animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-slate-800/70 animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-slate-800/70 animate-pulse" />
        </div>
        <p className="mt-5 text-sm text-slate-400 leading-6">
          WRAITH is generating the after-action analysis from the final battle state, terrain, and defense layout.
        </p>
      </div>
    )
  }

  const sections = parseDebrief(text || 'No debrief is available yet.')

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <section key={`${section.title}-${index}`} className="border border-wraith-border rounded p-4 bg-wraith-panel/20">
          <h2 className="text-base font-semibold text-slate-100 mb-3">{section.title}</h2>
          <div className="space-y-2">
            {section.lines.map((line, lineIndex) => (
              <p key={`${line}-${lineIndex}`} className="text-sm leading-6 text-slate-300 break-words">
                {line}
              </p>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function parseDebrief(text: string) {
  const sections: Array<{ title: string; lines: string[] }> = []
  let current: { title: string; lines: string[] } = { title: 'Overview', lines: [] }

  const lines = text.split('\n').map(line => (
    line
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/\*/g, '')
      .replace(/^\s*[-•]\s*/, '')
      .trim()
  )).filter(Boolean)

  lines.forEach((line) => {
    const markdownHeading = line.match(/^#{1,6}\s+(.+)$/)
    const plainHeading = line.replace(/:$/, '')
    const looksLikeHeading = plainHeading.length < 58 && /^[A-Z0-9\s/()'-]+$/.test(plainHeading)

    if (markdownHeading || looksLikeHeading) {
      if (current.lines.length > 0) sections.push(current)
      current = {
        title: titleCase((markdownHeading?.[1] || plainHeading).replace(/:$/, '')),
        lines: [],
      }
      return
    }

    current.lines.push(line)
  })

  if (current.lines.length > 0) sections.push(current)
  return sections.length > 0 ? sections : [{ title: 'Overview', lines: ['No debrief is available yet.'] }]
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase())
}

function DefenseLayoutPreview({ assets }: { assets: Array<{ id: string; x: number; y: number; type: DefenseAssetType; radius: number; name?: string }> }) {
  const colors: Record<DefenseAssetType, string> = {
    jammer: '#f59e0b',
    interceptor: '#ef4444',
    spoofer: '#a855f7',
  }

  return (
    <div className="relative h-[420px] rounded border border-wraith-border overflow-hidden bg-[#080c10]">
      <div className="absolute inset-0" style={{
        backgroundImage: 'linear-gradient(#203246 1px, transparent 1px), linear-gradient(90deg, #203246 1px, transparent 1px)',
        backgroundSize: '50px 50px',
      }} />
      <div className="absolute left-1/2 bottom-16 -translate-x-1/2 w-8 h-8 rounded-full border border-threat-critical text-threat-critical flex items-center justify-center text-xl">⊕</div>
      {assets.map(asset => (
        <div key={asset.id}>
          <div
            className="absolute rounded-full border"
            style={{
              left: `${(asset.x / 800) * 100}%`,
              top: `${(asset.y / 600) * 100}%`,
              width: `${Math.max(18, (asset.radius / 800) * 100)}%`,
              aspectRatio: '1 / 1',
              transform: 'translate(-50%, -50%)',
              borderColor: colors[asset.type],
            }}
          />
          <div
            className="absolute w-3 h-3 rounded-full"
            style={{
              left: `${(asset.x / 800) * 100}%`,
              top: `${(asset.y / 600) * 100}%`,
              transform: 'translate(-50%, -50%)',
              backgroundColor: colors[asset.type],
            }}
            title={asset.name || asset.type}
          />
        </div>
      ))}
    </div>
  )
}

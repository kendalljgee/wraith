import { useStore } from './store/battleStore'
import { useBattleSocket } from './hooks/useBattleSocket'
import BattleCanvas from './renderer/BattleCanvas'
import EvolutionPanel from './components/EvolutionPanel'
import { useState } from 'react'

const SESSION_ID = 'dev-session-001'

export default function App() {
  const { threatLevel, costDefender, costAttacker, connected, drones, addDefenseAsset } = useStore()
  useBattleSocket(SESSION_ID)

  const alive = drones.filter(d => d.alive).length
  const total = drones.length
  const [paused, setPaused] = useState(false)
  const [mode, setMode] = useState<'watch' | 'challenge'>('watch')
  const [selectedAsset, setSelectedAsset] = useState<string>('jammer')

  return (
    <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-4">

      {/* Header */}
      <div className="border border-wraith-border rounded p-3 mb-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-widest">
            Autonomous Red Team System
          </span>
          <h1 className="text-lg font-medium text-slate-100 mt-0.5">WRAITH</h1>
        </div>
      <div className="flex items-center gap-3">

        <button
          onClick={async () => {
            const newPaused = !paused
            setPaused(newPaused)

            // Pause/resume battle ticks
            await fetch(`${import.meta.env.VITE_API_URL}/api/battle/${newPaused ? 'pause' : 'resume'}`, { method: 'POST' })
            // Also pause/resume the evolutionary tournament so the engine stops advancing
            await fetch(`${import.meta.env.VITE_API_URL}/api/tournament/${newPaused ? 'pause' : 'resume'}`, { method: 'POST' })
          }}
          className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
        >
          {paused ? '▶ RESUME' : '⏸ PAUSE'}
        </button>

        {/* Mode & asset toolbar */}
        <div className="ml-3 flex items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="text-xs bg-transparent border border-wraith-border rounded px-2 py-1">
            <option value="watch">Watch</option>
            <option value="challenge">Challenge</option>
          </select>

          <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="text-xs bg-transparent border border-wraith-border rounded px-2 py-1">
            <option value="jammer">Jammer</option>
            <option value="interceptor">Interceptor</option>
            <option value="spoofer">Spoofer</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              connected
                ? 'bg-threat-low'
                : 'bg-threat-critical'
            }`}
          />

          <span className="text-slate-500">
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>

        </div>

</div>
      </div>

      {/* Stat panels */}
      <div className="grid grid-cols-4 gap-3 text-xs mb-4">
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Threat Level</div>
          <div className={`font-medium text-sm ${
            threatLevel === 'CRITICAL' ? 'text-threat-critical' :
            threatLevel === 'ELEVATED' ? 'text-threat-elevated' :
            'text-threat-low'
          }`}>{threatLevel}</div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Drones</div>
          <div className="text-slate-200 text-sm">
            {alive}<span className="text-slate-500">/{total}</span>
          </div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Defense Cost</div>
          <div className="text-slate-200 text-sm">${costDefender.toLocaleString()}</div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Attack Cost</div>
          <div className="text-slate-200 text-sm">${costAttacker.toLocaleString()}</div>
        </div>
      </div>

      {/* Main layout: canvas left, evolution panel right */}
      <div className="flex gap-4">
        <div className="shrink-0">
          <BattleCanvas
            mode={mode === 'watch' ? 'spectator' : 'challenge'}
            selectedAsset={selectedAsset}
            onPlaceAsset={(asset) => {
              // Add to frontend store so it appears in the UI immediately.
              addDefenseAsset({
                id: `manual_${Date.now()}`,
                x: asset.x,
                y: asset.y,
                type: asset.type || selectedAsset,
                radius: asset.type === 'interceptor' ? 60 : 110,
                active: true,
              })
            }}
          />
          {/* Legend */}
          <div className="flex gap-6 mt-3 text-xs text-slate-500">
            <span><span className="text-red-400">▲</span> Attacker Drone</span>
            <span><span className="text-amber-400">▲</span> Jammed</span>
            <span><span className="text-purple-400">▲</span> Spoofed</span>
            <span><span className="text-emerald-400">—</span> Comms Link</span>
          </div>
        </div>

        {/* Evolution panel fills remaining width */}
        <div className="flex-1" style={{ height: '600px' }}>
          <EvolutionPanel />
        </div>
      </div>

    </div>
  )
}
import { useState } from 'react'
import EvolutionPanel from './components/EvolutionPanel'
import { useBattleSocket } from './hooks/useBattleSocket'
import BattleCanvas from './renderer/BattleCanvas'
import { useStore } from './store/battleStore'
import type { DefenseAssetType, DefenseUpgrade } from './store/battleStore'

const SESSION_ID = 'dev-session-001'
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001'

const ASSET_TOOLS: Array<{
  type: DefenseAssetType
  label: string
  color: string
  radius: number
}> = [
  { type: 'jammer', label: 'Jammer', color: '#f59e0b', radius: 110 },
  { type: 'interceptor', label: 'Interceptor', color: '#ef4444', radius: 60 },
  { type: 'spoofer', label: 'Spoofer', color: '#a855f7', radius: 110 },
]

const UPGRADE_TOOLS: Array<{
  key: DefenseUpgrade
  label: string
}> = [
  { key: 'ew_range', label: 'EW range' },
  { key: 'interceptor_readiness', label: 'Reload' },
  { key: 'sensor_fusion', label: 'Sensor fusion' },
]

export default function App() {
  const {
    threatLevel,
    connected,
    drones,
    defenseAssets,
    defenseUpgrades,
    addDefenseAsset,
  } = useStore()
  const { placeDefenseAsset, upgradeDefense } = useBattleSocket(SESSION_ID)

  const alive = drones.filter(d => d.alive).length
  const disabled = drones.length - alive
  const total = drones.length
  const [challengeActive, setChallengeActive] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<DefenseAssetType>('jammer')

  async function enterChallenge() {
    setChallengeActive(true)
    await fetch(`${API_URL}/api/battle/pause`, { method: 'POST' })
  }

  async function runDefense() {
    setChallengeActive(false)
    await fetch(`${API_URL}/api/battle/resume`, { method: 'POST' })
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
              Enter Challenge
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
          <div className={`font-medium text-sm ${
            threatLevel === 'CRITICAL' ? 'text-threat-critical' :
            threatLevel === 'ELEVATED' ? 'text-threat-elevated' :
            'text-threat-low'
          }`}>{threatLevel}</div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">Drones Active</div>
          <div className="text-slate-200 text-sm">
            {alive}<span className="text-slate-500">/{total}</span>
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
                onClick={() => setSelectedAsset(tool.type)}
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
          </div>

          <div className="flex items-center gap-2">
            {UPGRADE_TOOLS.map(upgrade => (
              <button
                key={upgrade.key}
                onClick={() => upgradeDefense({ upgrade: upgrade.key })}
                disabled={defenseUpgrades[upgrade.key] >= 3}
                className="text-xs border border-wraith-border rounded px-2 py-1 text-slate-400 hover:text-slate-100 disabled:opacity-40 disabled:hover:text-slate-400 transition-colors"
              >
                {upgrade.label} {defenseUpgrades[upgrade.key]}/3
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-4">
        <div className="shrink-0">
          <BattleCanvas
            mode={challengeActive ? 'challenge' : 'spectator'}
            selectedAsset={selectedAsset}
            onPlaceAsset={(asset) => {
              const type = asset.type || selectedAsset
              const tool = ASSET_TOOLS.find(item => item.type === type)!

              placeDefenseAsset({
                asset_type: type,
                x: asset.x,
                y: asset.y,
              })

              addDefenseAsset({
                id: `manual_${Date.now()}`,
                x: asset.x,
                y: asset.y,
                type,
                radius: tool.radius,
                active: true,
              })
            }}
          />
          <div className="flex gap-6 mt-3 text-xs text-slate-500">
            <span><span className="text-red-400">A</span> Drone</span>
            <span><span className="text-amber-400">J</span> Jammed</span>
            <span><span className="text-purple-400">S</span> Spoofed</span>
            <span><span className="text-emerald-400">-</span> Link</span>
          </div>
        </div>

        <div className="flex-1" style={{ height: '600px' }}>
          <EvolutionPanel challengeActive={challengeActive} />
        </div>
      </div>
    </div>
  )
}

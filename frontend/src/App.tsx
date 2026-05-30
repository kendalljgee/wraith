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
    moveDefenseAsset,
    incrementDefenseUpgrade,
  } = useStore()
  const { placeDefenseAsset, moveDefenseAsset: sendMoveDefenseAsset, upgradeDefense } = useBattleSocket(SESSION_ID)

  const alive = drones.filter(d => d.alive).length
  const disabled = drones.length - alive
  const total = drones.length
  const [challengeActive, setChallengeActive] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<DefenseAssetType>('jammer')
  const [paused, setPaused] = useState(false)

  const selectedTool = ASSET_TOOLS.find(tool => tool.type === selectedAsset)!
  const selectedRadius = getAssetRadius(selectedAsset, selectedTool.radius, defenseUpgrades)

  async function enterChallenge() {
    setChallengeActive(true)
    setPaused(true)
    await fetch(`${API_URL}/api/battle/pause`, { method: 'POST' })
  }

  async function runDefense() {
    setChallengeActive(false)
    setPaused(false)
    await fetch(`${API_URL}/api/battle/resume`, { method: 'POST' })
  }

  async function togglePause() {
    const nextPaused = !paused
    setPaused(nextPaused)
    await fetch(`${API_URL}/api/battle/${nextPaused ? 'pause' : 'resume'}`, { method: 'POST' })
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
                onClick={() => {
                  incrementDefenseUpgrade(upgrade.key)
                  upgradeDefense({ upgrade: upgrade.key })
                }}
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
            previewRadius={selectedRadius}
            onPlaceAsset={(asset) => {
              placeDefenseAsset({
                id: asset.id,
                asset_type: asset.type,
                x: asset.x,
                y: asset.y,
              })

              addDefenseAsset({
                id: asset.id,
                x: asset.x,
                y: asset.y,
                type: asset.type,
                radius: selectedRadius,
                active: true,
              })
            }}
            onMoveAsset={(asset) => {
              moveDefenseAsset(asset.id, asset.x, asset.y)
              sendMoveDefenseAsset(asset)
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

function getAssetRadius(
  type: DefenseAssetType,
  baseRadius: number,
  upgrades: Record<DefenseUpgrade, number>,
) {
  let radius = baseRadius
  if (type === 'jammer' || type === 'spoofer') {
    radius *= 1 + upgrades.ew_range * 0.15
  }
  radius *= 1 + upgrades.sensor_fusion * 0.08
  return Math.round(radius * 10) / 10
}

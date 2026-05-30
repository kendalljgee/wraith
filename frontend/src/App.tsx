import { useStore } from './store/battleStore'
import { useBattleSocket } from './hooks/useBattleSocket'
import BattleCanvas from './renderer/BattleCanvas'

const SESSION_ID = 'dev-session-001'

export default function App() {
  const { threatLevel, costDefender, costAttacker, connected, drones } = useStore()
  useBattleSocket(SESSION_ID)

  const alive = drones.filter(d => d.alive).length
  const total = drones.length

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
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-1.5 h-1.5 rounded-full ${
            connected ? 'bg-threat-low' : 'bg-threat-critical'
          }`}/>
          <span className="text-slate-500">
            {connected ? 'CONNECTED' : 'OFFLINE'}
          </span>
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

      {/* Battle canvas */}
      <BattleCanvas />

      {/* Legend */}
      <div className="flex gap-6 mt-3 text-xs text-slate-500">
        <span><span className="text-red-400">▲</span> Attacker Drone</span>
        <span><span className="text-amber-400">▲</span> Jammed</span>
        <span><span className="text-purple-400">▲</span> Spoofed</span>
        <span><span className="text-emerald-400">—</span> Comms Link</span>
        <span><span className="text-amber-400">○</span> Jammer</span>
        <span><span className="text-red-400">○</span> Interceptor</span>
      </div>

    </div>
  )
}
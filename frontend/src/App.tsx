import { useStore } from './store/battleStore'
import { useBattleSocket } from './hooks/useBattleSocket'

const SESSION_ID = 'dev-session-001' // hardcode for now

export default function App() {
  const { threatLevel, costDefender, costAttacker, connected } = useStore()
  useBattleSocket(SESSION_ID)

  return (
    <div className="min-h-screen bg-wraith-bg text-slate-200 font-mono p-4">

      {/* Header */}
      <div className="border border-wraith-border rounded p-3 mb-4 flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500 uppercase tracking-widest">
            Autonomous Red Team System
          </span>
          <h1 className="text-lg font-medium text-slate-100 mt-0.5">
            WRAITH
          </h1>
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
      <div className="grid grid-cols-3 gap-3 text-xs mb-4">
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">
            Threat Level
          </div>
          <div className={`font-medium text-sm ${
            threatLevel === 'CRITICAL' ? 'text-threat-critical' :
            threatLevel === 'ELEVATED' ? 'text-threat-elevated' :
            'text-threat-low'
          }`}>
            {threatLevel}
          </div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">
            Defense Cost
          </div>
          <div className="text-slate-200 text-sm">
            ${costDefender.toLocaleString()}
          </div>
        </div>
        <div className="border border-wraith-border rounded p-3">
          <div className="text-slate-500 uppercase tracking-widest mb-1">
            Attack Cost
          </div>
          <div className="text-slate-200 text-sm">
            ${costAttacker.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Canvas placeholder */}
      <div className="border border-wraith-border rounded bg-wraith-panel"
           style={{height: '480px'}}
           id="battle-canvas">
        <div className="flex items-center justify-center h-full text-slate-600 text-xs uppercase tracking-widest">
          Simulation canvas — initializing
        </div>
      </div>

    </div>
  )
}
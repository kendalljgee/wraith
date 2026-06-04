import { useState } from 'react'
import { useStore } from '../store/battleStore'

const MAX_ATTACK_FITNESS = 1.8

function pressurePercent(fitness: number) {
  return Math.round(Math.min(100, Math.max(0, (fitness / MAX_ATTACK_FITNESS) * 100)))
}

interface EvolutionPanelProps {
  challengeActive?: boolean
}

export default function EvolutionPanel({ challengeActive = false }: EvolutionPanelProps) {
  const generations = useStore(s => s.generations)
  const evolutionComplete = useStore(s => s.evolutionComplete)
  const [expandedGen, setExpandedGen] = useState<number | null>(null)
  const best = generations.length > 0
    ? Math.max(...generations.map(g => g.fitness))
    : 0
  const bestPercent = pressurePercent(best)
  const latestLlm = [...generations].reverse().find(gen => gen.isLLM && gen.reasoning)

  return (
    <div className="border border-wraith-border rounded p-3 h-full flex flex-col min-w-0">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-mono text-xs text-slate-500 uppercase tracking-widest">
            Evolution Engine
          </div>
          <div className="font-mono text-sm text-slate-200 mt-0.5">
            Gen {generations.length}
            <span className="text-slate-500 text-xs ml-2">
              attacker pressure {bestPercent}%
            </span>
          </div>
        </div>
        <div className="font-mono text-xs text-slate-600 uppercase tracking-widest">
          {challengeActive ? 'Awaiting Assets' : generations.length === 0 ? 'Initializing...' : evolutionComplete ? 'Complete' : 'Running'}
        </div>
      </div>

      <div className="mb-3 border border-wraith-border rounded p-2 min-w-0 overflow-hidden">
        <div className="font-mono text-xs text-slate-500 uppercase tracking-widest mb-1">
          LLM Reasoning
        </div>
        <div className="text-xs text-slate-300 whitespace-pre-wrap break-words">
          {latestLlm?.reasoning || 'Waiting for the analyst model to propose a mutation.'}
        </div>
      </div>

      {/* Completion banner */}
      {evolutionComplete && (
        <div className="mb-2 p-2 bg-amber-900 text-amber-100 rounded text-xs">
          Evolution complete - no further generations will be produced.
        </div>
      )}

      {/* Generation list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {generations.length === 0 ? (
          <div className="text-xs text-slate-600 mt-4 text-center">
            Waiting for first generation...
          </div>
        ) : (
          [...generations].reverse().map((gen, i) => (
            <div key={gen.number} className={`font-mono text-xs py-1 ${i === 0 ? 'opacity-100' : 'opacity-60'}`}>
              <div className="flex items-center gap-2">
              {/* Gen number */}
              <span className="text-slate-500 w-10 shrink-0">
                {String(gen.number).padStart(3, '0')}
              </span>

              {/* Fitness bar */}
              <div className="flex-1 bg-wraith-panel rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pressurePercent(gen.fitness)}%`,
                    backgroundColor: gen.isLLM ? '#f59e0b' : '#22c55e'
                  }}
                />
              </div>

              {/* Fitness value */}
              <span className={`w-10 text-right shrink-0 ${
                gen.isLLM ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {pressurePercent(gen.fitness)}%
              </span>

                {/* LLM badge (click to expand reasoning) */}
                {gen.isLLM && (
                  <button className="text-amber-400 shrink-0" onClick={() => setExpandedGen(expandedGen === gen.number ? null : gen.number)}>LLM</button>
                )}

                {/* Attack type */}
                <span className="text-slate-600 w-20 shrink-0">{gen.mutation === 'fragmentation' ? 'frag' : gen.mutation === 'decoy' ? 'decoy' : 'direct'}</span>
                <span className="text-slate-600 w-24 shrink-0">
                  {gen.metrics?.objective_reached ? 'breach' : 'blocked'}
                </span>
              </div>

              {gen.metrics && (
                <div className="ml-12 mt-1 text-[11px] text-slate-600">
                  disabled {gen.metrics.disabled_drones ?? 0}/{gen.metrics.total_drones ?? 0}
                  <span className="mx-2">|</span>
                  closest {Math.round(gen.metrics.closest_to_objective_m ?? 0)}m
                </div>
              )}

              {expandedGen === gen.number && gen.reasoning && (
                <div className="mt-1 text-xs text-slate-400 italic px-2">
                  {gen.reasoning}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Best strategy params */}
      {generations.length > 0 && (() => {
        const best = [...generations].sort((a, b) => b.fitness - a.fitness)[0]
        return (
          <div className="font-mono mt-3 pt-3 border-t border-wraith-border text-xs text-slate-500">
            <div className="uppercase tracking-widest mb-1">Best Strategy</div>
            <div className="space-y-0.5">
              <div>type: <span className="text-slate-300">{best.mutation}</span></div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

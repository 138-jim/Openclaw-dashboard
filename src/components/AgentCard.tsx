'use client';
import { AgentState } from '@/lib/agents';
import StatusBadge, { STATUS_CONFIG } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';

export default function AgentCard({ agent, detailed = false }: { agent: AgentState, detailed?: boolean }) {
  const normalizedState = agent.state?.toLowerCase() || 'idle';
  const config = STATUS_CONFIG[normalizedState] || STATUS_CONFIG.idle;
  
  return (
    <div className={`glass rounded-xl p-5 flex flex-col relative overflow-hidden group transition-all duration-300 hover:-translate-y-1`}>
      {/* Subtle background glow based on state */}
      <div className={`absolute -inset-10 opacity-0 group-hover:opacity-20 transition-opacity duration-500 blur-2xl pointer-events-none ${config.bg}`} />
      
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xl shadow-inner">
            {agent.emoji}
          </div>
          <div>
            <h3 className="font-semibold text-gray-100 tracking-tight">{agent.name}</h3>
            {detailed && agent.model && (
              <p className="text-xs text-gray-500 font-mono mt-0.5">{agent.model}</p>
            )}
          </div>
        </div>
        <StatusBadge state={agent.state} />
      </div>
      
      <div className="mt-auto relative z-10">
        <p className="text-sm text-gray-400 line-clamp-2 min-h-[40px] leading-relaxed">
          {agent.detail || 'Standing by.'}
        </p>
        
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
            {agent.updated_at ? formatDistanceToNow(new Date(agent.updated_at), { addSuffix: true }) : 'Just now'}
          </span>
          {detailed && (
            <span className="text-[10px] text-gray-500 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-green-500" />
              100% UPTIME
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

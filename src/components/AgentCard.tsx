'use client';
import { useState, useEffect, useCallback } from 'react';
import { AgentState, STATE_COLORS } from '@/lib/agents';
import StatusBadge, { STATUS_CONFIG } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';

interface ExtendedData {
  tokenHistory: number[];
  sessionCount: number;
  totalTokens: number;
}

const EMPTY_HISTORY: number[] = new Array(24).fill(0);

function Sparkline({ data, color, wide, id }: { data: number[]; color: string; wide: boolean; id: string }) {
  const w = wide ? 200 : 60;
  const h = wide ? 40 : 20;
  const max = Math.max(...data, 1);

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x},${y}`;
    })
    .join(' ');

  const gradientId = `spark-${id}-${wide ? 'wide' : 'sm'}`;
  const fillPoints = `0,${h} ${points} ${w},${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={wide ? 'w-full' : ''} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline fill={`url(#${gradientId})`} stroke="none" points={fillPoints} />
      <polyline fill="none" stroke={color} strokeWidth={wide ? 1.5 : 1} points={points} />
    </svg>
  );
}

export default function AgentCard({ agent, detailed = false }: { agent: AgentState; detailed?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [extData, setExtData] = useState<ExtendedData | null>(null);

  const normalizedState = agent.state?.toLowerCase() || 'idle';
  const config = STATUS_CONFIG[normalizedState] || STATUS_CONFIG.idle;
  const sparkColor = STATE_COLORS[normalizedState] || STATE_COLORS.idle;

  const fetchExtended = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agent.label}`);
      if (res.ok) setExtData(await res.json());
    } catch { /* ignore */ }
  }, [agent.label]);

  useEffect(() => {
    fetchExtended();
  }, [fetchExtended]);

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('focusAgent', { detail: agent.label }));
  };

  const glowStyle = { '--card-glow': config.color.replace('text-', '') } as React.CSSProperties;

  const tokenHistory = extData?.tokenHistory ?? EMPTY_HISTORY;
  const hasActivity = tokenHistory.some(v => v > 0);

  return (
    <div
      className="glass rounded-xl p-5 flex flex-col relative overflow-hidden group transition-all duration-300 hover:-translate-y-1 cursor-pointer"
      style={glowStyle}
      onClick={() => setExpanded(prev => !prev)}
    >
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleFocus}
            className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Focus agent in office"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </button>
          <StatusBadge state={agent.state} />
        </div>
      </div>

      <div className="mt-auto relative z-10">
        <p className="text-sm text-gray-400 line-clamp-2 min-h-[40px] leading-relaxed">
          {agent.detail || 'Standing by.'}
        </p>

        {!expanded && hasActivity && (
          <div className="mt-3">
            <Sparkline data={tokenHistory} color={sparkColor} wide={false} id={agent.label} />
          </div>
        )}

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
          style={{ maxHeight: expanded ? '200px' : '0px', opacity: expanded ? 1 : 0 }}
        >
          <div className="pt-3 space-y-2">
            {agent.model && (
              <div className="flex justify-between text-xs text-gray-400">
                <span>Model</span>
                <span className="font-mono text-gray-300">{agent.model}</span>
              </div>
            )}
            <div className="flex justify-between text-xs text-gray-400">
              <span>Sessions</span>
              <span className="font-mono text-gray-300">{extData?.sessionCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Total tokens</span>
              <span className="font-mono text-gray-300">
                {(extData?.totalTokens ?? 0).toLocaleString()}
              </span>
            </div>
            {hasActivity && (
              <div className="pt-1">
                <Sparkline data={tokenHistory} color={sparkColor} wide={true} id={agent.label} />
              </div>
            )}
          </div>
        </div>

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

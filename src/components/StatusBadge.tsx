'use client';

export const STATUS_CONFIG: Record<string, { color: string, bg: string, border: string }> = {
  idle: { color: 'text-slate-300', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
  writing: { color: 'text-blue-300', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  researching: { color: 'text-purple-300', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  executing: { color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  syncing: { color: 'text-cyan-300', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  error: { color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

export default function StatusBadge({ state }: { state: string }) {
  const normalizedState = state?.toLowerCase() || 'idle';
  const config = STATUS_CONFIG[normalizedState] || STATUS_CONFIG.idle;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide uppercase border backdrop-blur-md ${config.color} ${config.bg} ${config.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${normalizedState !== 'idle' ? 'animate-pulse' : ''}`} />
      {state}
    </span>
  );
}

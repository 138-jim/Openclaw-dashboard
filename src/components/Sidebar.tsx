'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Virtual Office', icon: '🏢', key: 'office' },
  { href: '/agents', label: 'Agents', icon: '🤖', key: 'agents' },
  { href: '/sessions', label: 'Sessions', icon: '💬', key: 'sessions' },
  { href: '/stats', label: 'Stats & Metrics', icon: '📊', key: 'stats' },
];

export default function Sidebar({ health }: { health?: string }) {
  const path = usePathname();
  
  const healthColors: Record<string, string> = {
    healthy: 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]',
    unreachable: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]',
    error: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
  };
  
  const hColor = healthColors[health || ''] || 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]';

  return (
    <nav className="w-64 glass-panel border-r border-white/5 p-6 flex flex-col shrink-0 transition-all duration-300 z-20">
      <div className="flex items-center gap-3 mb-10 px-2">
        <div className="text-2xl bg-gradient-to-br from-purple-500 to-blue-500 text-transparent bg-clip-text drop-shadow-sm">🦞</div>
        <div className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
          OpenClaw
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3">Menu</div>
        {NAV.map(n => {
          const isActive = path === n.href;
          return (
            <Link key={n.key} href={n.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group
                ${isActive
                  ? 'bg-white/10 text-white border-l-2 border-purple-400 shadow-[inset_2px_0_8px_rgba(192,132,252,0.4),inset_0_1px_1px_rgba(255,255,255,0.1)]'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-gradient-to-r hover:from-white/5 hover:to-transparent border-l-2 border-transparent'}`}>
              <span className={`text-base transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>{n.icon}</span>
              {n.label}
            </Link>
          );
        })}
      </div>
      
      <div className="mt-auto pt-6 border-t border-white/5">
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-black/20 border border-white/5">
          <span className="text-xs text-gray-400 font-medium">Gateway</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-gray-300">{health || 'SYNCING'}</span>
            <div className={`w-2 h-2 rounded-full animate-pulse-glow ${hColor}`} style={{ '--glow-color': '255,255,255' } as React.CSSProperties} />
          </div>
        </div>
      </div>
    </nav>
  );
}

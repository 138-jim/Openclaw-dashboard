'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import { AgentState } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';

export function useAgents() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const refresh = useCallback(() => {
    fetch('/api/agents').then(r => r.json()).then((data: AgentState[]) => {
      setAgents(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
    }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);
  return agents;
}

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const refresh = useCallback(() => {
    fetch('/api/conversations').then(r => r.json()).then(setConversations).catch(() => {});
  }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);
  return conversations;
}

export function useVisitors() {
  const [visitors, setVisitors] = useState<SlackVisitor[]>([]);
  const refresh = useCallback(() => {
    fetch('/api/visitors').then(r => r.json()).then((data: SlackVisitor[]) => {
      setVisitors(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data);
    }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); const i = setInterval(refresh, 5000); return () => clearInterval(i); }, [refresh]);
  return visitors;
}

export function useHealth() {
  const [health, setHealth] = useState('');
  useEffect(() => {
    const check = () => fetch('/api/health').then(r => r.json()).then(d => setHealth((prev: string) => prev === d.status ? prev : d.status)).catch(() => setHealth('error'));
    check(); const i = setInterval(check, 15000); return () => clearInterval(i);
  }, []);
  return health;
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const health = useHealth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden text-gray-100 selection:bg-purple-500/30">
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: 'conic-gradient(from 0deg, rgba(139,92,246,0.15), rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
          opacity: 0.03,
          animation: 'rotate-bg 60s linear infinite',
        }}
      />

      {/* Hamburger button — mobile only */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-40 md:hidden p-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10 text-gray-200 hover:bg-white/15 transition-colors"
        aria-label="Open navigation menu"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 transition-transform duration-300 ease-in-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar health={health} onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar health={health} />
      </div>

      <main className="flex-1 overflow-auto relative">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>
        <div className="max-w-7xl mx-auto p-8 lg:p-10 relative z-10 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}

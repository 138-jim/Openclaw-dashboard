'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import { AgentState } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';

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
  return (
    <div className="flex h-screen overflow-hidden text-gray-100 selection:bg-purple-500/30">
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

'use client';
import PixelOffice from '@/components/PixelOffice';
import AgentCard from '@/components/AgentCard';
import { useAgents, useConversations, useVisitors } from '@/components/DashboardShell';
import PageTransition from '@/components/PageTransition';
import ActivityFeed from '@/components/ActivityFeed';

export default function OfficePage() {
  const agents = useAgents();
  const conversations = useConversations();
  const visitors = useVisitors();

  return (
    <PageTransition>
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">Virtual Office</h1>
        <p className="text-gray-400 text-sm">Real-time spatial visualization of active agents and their current tasks.</p>
      </div>

      <div className="glass-panel rounded-2xl p-1 relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-blue-500/5 opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        <div className="relative rounded-xl overflow-hidden bg-[#05050a] border border-white/5">
           <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
           <PixelOffice agents={agents} conversations={conversations} visitors={visitors} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-200">Active Agents</h2>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-gray-400 font-medium">{agents.length} Online</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agents.map(a => <AgentCard key={a.label} agent={a} />)}
          {agents.length === 0 && (
            <div className="col-span-full py-12 text-center border border-dashed border-white/10 rounded-xl bg-white/5">
              <div className="text-4xl mb-3 opacity-50">😴</div>
              <p className="text-gray-400 text-sm">No agents are currently active.</p>
            </div>
          )}
        </div>
      </div>

      <ActivityFeed />
    </div>
    </PageTransition>
  );
}

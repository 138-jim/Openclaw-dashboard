'use client';
import { useState } from 'react';
import AgentCard from '@/components/AgentCard';
import { useAgents } from '@/components/DashboardShell';
import PageTransition from '@/components/PageTransition';

export default function AgentsPage() {
  const agents = useAgents();
  const [search, setSearch] = useState('');
  
  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    (a.state && a.state.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <PageTransition>
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">Agent Roster</h1>
          <p className="text-gray-400 text-sm">Monitor and manage all configured OpenClaw agents.</p>
        </div>
        
        <div className="relative w-full md:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            aria-label="Search agents"
            className="block w-full pl-10 pr-3 py-2 border border-white/10 rounded-lg leading-5 bg-black/20 text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm transition-colors"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {filteredAgents.map(a => <AgentCard key={a.label} agent={a} detailed={true} />)}
        
        {filteredAgents.length === 0 && (
          <div className="col-span-full py-20 text-center glass rounded-xl">
            <p className="text-gray-400">No agents found matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
    </PageTransition>
  );
}

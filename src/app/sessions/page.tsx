'use client';
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import PageTransition from '@/components/PageTransition';

interface Session { agent: string; file: string; lastMessage: string; timestamp: string; tokenUsage: number; }

export default function SessionsPage() {
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch('/api/sessions').then(r => r.json()).then(setAllSessions).catch(() => {});
  }, []);

  const uniqueAgents = Array.from(new Set(allSessions.map(s => s.agent)));
  const sessions = filter ? allSessions.filter(s => s.agent === filter) : allSessions;

  return (
    <PageTransition>
    <div className="flex flex-col gap-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">Session Logs</h1>
          <p className="text-gray-400 text-sm">Trace recent interactions and token usage across channels.</p>
        </div>
        
        <div className="relative">
          <select
            aria-label="Filter by agent"
            className="appearance-none bg-black/20 border border-white/10 text-gray-300 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block w-full md:w-48 p-2.5 pr-8 transition-colors"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All Agents</option>
            {uniqueAgents.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs text-gray-500 uppercase bg-black/20 border-b border-white/5">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Agent</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Channel / File</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider">Last Message</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider text-right">Tokens</th>
                <th scope="col" className="px-6 py-4 font-semibold tracking-wider text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.map((s, i) => {
                // Determine channel badge styling
                let channelType = 'slack';
                if (s.file.includes('cron')) channelType = 'cron';
                else if (s.file.includes('webchat')) channelType = 'webchat';
                
                const badgeColor = 
                  channelType === 'slack' ? 'bg-[#4A154B]/30 text-[#E01E5A] border-[#E01E5A]/20' :
                  channelType === 'cron' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                  'bg-blue-500/10 text-blue-400 border-blue-500/20';
                  
                return (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-xs border border-white/5 shadow-inner">
                          {s.agent.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-200">{s.agent}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${badgeColor}`}>
                        {channelType.toUpperCase()}
                      </span>
                      <span className="ml-2 text-xs text-gray-500 font-mono truncate max-w-[150px] inline-block align-bottom">{s.file.split('/').pop()}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-md truncate text-gray-300 group-hover:text-white transition-colors">
                        {s.lastMessage || <span className="text-gray-600 italic">No message content</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono text-xs text-purple-300">{s.tokenUsage.toLocaleString()}</span>
                        <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-purple-500/50 rounded-full" style={{ width: `${Math.min(100, (s.tokenUsage / 8000) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                      <span className="text-gray-400">
                        {formatDistanceToNow(new Date(s.timestamp), { addSuffix: true })}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No sessions found. Try adjusting your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}

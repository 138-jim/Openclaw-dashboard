'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import StatCard from '@/components/StatCard';

export default function StatsPage() {
  const [stats, setStats] = useState<Record<string, number>>({});
  
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const data = Object.entries(stats)
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((a, b) => b.tokens - a.tokens);

  const total = data.reduce((s, d) => s + d.tokens, 0);
  const activeAgents = data.length;
  
  // Color palette for bars
  const colors = ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981'];

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass p-3 rounded-lg border border-white/10 shadow-xl">
          <p className="font-semibold text-gray-200 mb-1">{label}</p>
          <p className="text-sm font-mono text-purple-300">
            {payload[0].value.toLocaleString()} tokens
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">System Metrics</h1>
        <p className="text-gray-400 text-sm">Aggregated performance and usage statistics across the Gateway.</p>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Tokens Processed" 
          value={total.toLocaleString()} 
          icon={<svg className="w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
          trend="+12.5% this week"
        />
        <StatCard 
          title="Active Agents" 
          value={activeAgents} 
          icon={<svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <StatCard 
          title="Avg Latency" 
          value="245ms" 
          icon={<svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <StatCard 
          title="System Uptime" 
          value="99.99%" 
          icon={<svg className="w-8 h-8 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="glass rounded-xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-200 mb-6">Token Usage by Agent</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#9ca3af', fontSize: 12 }} 
                  axisLine={false}
                  tickLine={false}
                  angle={-45} 
                  textAnchor="end" 
                  height={60}
                  dy={10}
                />
                <YAxis 
                  tick={{ fill: '#9ca3af', fontSize: 12 }} 
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Table */}
        <div className="glass rounded-xl p-0 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/5 bg-black/10">
            <h2 className="text-lg font-semibold text-gray-200">Usage Breakdown</h2>
          </div>
          <div className="overflow-auto flex-1 max-h-[400px]">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase bg-black/20 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-3 font-semibold">Agent</th>
                  <th className="px-6 py-3 font-semibold text-right">Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.map((d, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 font-medium text-gray-300">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
                        {d.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-gray-400">
                      {d.tokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

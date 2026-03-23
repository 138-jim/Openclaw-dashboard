'use client';
import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  Area, AreaChart, PieChart, Pie,
} from 'recharts';
import StatCard from '@/components/StatCard';
import PageTransition from '@/components/PageTransition';
import { STATE_COLORS } from '@/lib/agents';

interface StatsData {
  byAgent: Record<string, number>;
  timeSeries: Array<{ date: string; tokens: number }>;
  stateDistribution: Record<string, number>;
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {});
  }, []);

  const byAgent = stats?.byAgent ?? {};
  const timeSeries = stats?.timeSeries ?? [];
  const stateDistribution = stats?.stateDistribution ?? {};

  const data = Object.entries(byAgent)
    .map(([name, tokens]) => ({ name, tokens }))
    .sort((a, b) => b.tokens - a.tokens);

  const total = data.reduce((s, d) => s + d.tokens, 0);
  const activeAgents = data.length;

  const stateData = Object.entries(stateDistribution).map(([state, count]) => ({
    name: state.charAt(0).toUpperCase() + state.slice(1),
    value: count,
    fill: STATE_COLORS[state] || '#6b7280',
  }));

  const avgTokensPerAgent = activeAgents > 0 ? Math.round(total / activeAgents) : 0;

  const totalAgentStates = Object.values(stateDistribution).reduce((s, v) => s + v, 0);
  const idleCount = stateDistribution['idle'] || 0;
  const activeRatio = totalAgentStates > 0
    ? ((totalAgentStates - idleCount) / totalAgentStates * 100).toFixed(1)
    : '0.0';

  const colors = ['#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981'];

  const ChartTooltip = ({ active, payload, label, unit = 'tokens' }: any) => {
    if (!active || !payload?.length) return null;
    const name = label ?? payload[0].name;
    const val = payload[0].value;
    const formatted = unit === 'tokens' ? `${val.toLocaleString()} tokens` : `${val} agent${val !== 1 ? 's' : ''}`;
    return (
      <div className="glass p-3 rounded-lg border border-white/10 shadow-xl">
        <p className="font-semibold text-gray-200 mb-1">{name}</p>
        <p className="text-sm font-mono text-purple-300">{formatted}</p>
      </div>
    );
  };

  return (
    <PageTransition>
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">System Metrics</h1>
        <p className="text-gray-400 text-sm">Aggregated performance and usage statistics across the Gateway.</p>
      </div>

      {/* Row 1: Hero Stats */}
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
          title="Avg Tokens / Agent"
          value={avgTokensPerAgent.toLocaleString()}
          icon={<svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        />
        <StatCard
          title="Active Rate"
          value={`${activeRatio}%`}
          icon={<svg className="w-8 h-8 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
      </div>

      {/* Row 2: Bar chart + Breakdown table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
                <Bar dataKey="tokens" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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

      {/* Row 3: Line chart + Donut chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-200 mb-6">Token Usage — Last 7 Days</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="purpleGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${value / 1000}k` : `${value}`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="tokens"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#purpleGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Agent States</h2>
          <div className="flex-1 flex items-center justify-center min-h-[220px]">
            {stateData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={stateData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {stateData.map((entry, index) => (
                      <Cell key={`pie-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip unit="agents" />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm">No state data available</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 justify-center">
            {stateData.map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.fill }} />
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    </PageTransition>
  );
}

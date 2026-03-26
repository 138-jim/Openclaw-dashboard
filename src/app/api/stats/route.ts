import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { AGENTS } from '@/lib/agents';
import { HOME, AGENTS_DIR } from '@/lib/paths';

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 0.80, output: 4 },
  'gemini-3-flash-preview': { input: 0.15, output: 0.60 },
  'gemini-3-pro-preview': { input: 1.25, output: 5 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 5 },
  'gpt-5.1-codex': { input: 2.50, output: 10 },
};
const DEFAULT_PRICING = { input: 3, output: 15 }; // default to Sonnet

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  return (inputTokens / 1_000_000 * pricing.input) + (outputTokens / 1_000_000 * pricing.output);
}

interface SessionData {
  sessionId?: string;
  updatedAt?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  origin?: { provider?: string; surface?: string };
}

export async function GET() {
  const byAgent: Record<string, number> = {};
  const costByAgent: Record<string, number> = {};
  const timeMap: Record<string, number> = {};
  const stateDistribution: Record<string, number> = {};
  const modelUsage: Record<string, number> = {};
  let totalSessions = 0;
  let totalCost = 0;

  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    timeMap[d.toISOString().slice(0, 10)] = 0;
  }

  const tokenStatsPromise = (async () => {
    try {
      const agentDirs = await readdir(AGENTS_DIR);
      await Promise.all(agentDirs.map(async (agentDir) => {
        const sessionsFile = path.join(AGENTS_DIR, agentDir, 'sessions', 'sessions.json');
        let agentTokens = 0;
        let agentCost = 0;

        try {
          const raw = await readFile(sessionsFile, 'utf-8');
          const parsed = JSON.parse(raw);
          const sessions: SessionData[] = Array.isArray(parsed) ? parsed : Object.values(parsed);

          for (const s of sessions) {
            const tokens = s.totalTokens || 0;
            const inputTokens = s.inputTokens || 0;
            const outputTokens = s.outputTokens || 0;
            const model = s.model || 'unknown';
            const cost = calculateCost(model, inputTokens, outputTokens);

            agentTokens += tokens;
            agentCost += cost;
            totalSessions++;
            modelUsage[model] = (modelUsage[model] || 0) + 1;

            if (s.updatedAt) {
              const ms = s.updatedAt > 1e12 ? s.updatedAt : s.updatedAt * 1000;
              const dateStr = new Date(ms).toISOString().slice(0, 10);
              if (dateStr in timeMap) {
                timeMap[dateStr] += tokens;
              }
            }
          }
        } catch {}

        if (agentTokens > 0) {
          byAgent[agentDir] = agentTokens;
          costByAgent[agentDir] = Math.round(agentCost * 100) / 100;
        }
        totalCost += agentCost;
      }));
    } catch {}
  })();

  const statePromise = Promise.all(
    AGENTS.map(async (agent) => {
      const stateFile = path.join(HOME, `.openclaw/workspace-${agent.label}/star_state.json`);
      let state = 'idle';
      try {
        const raw = await readFile(stateFile, 'utf-8');
        const data = JSON.parse(raw);
        state = data.state || 'idle';
      } catch {}
      stateDistribution[state] = (stateDistribution[state] || 0) + 1;
    })
  );

  await Promise.all([tokenStatsPromise, statePromise]);

  const timeSeries = Object.entries(timeMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tokens]) => ({ date, tokens }));

  return NextResponse.json({
    byAgent,
    costByAgent,
    timeSeries,
    stateDistribution,
    modelUsage,
    totalSessions,
    totalCost: Math.round(totalCost * 100) / 100,
  });
}

export const dynamic = 'force-dynamic';

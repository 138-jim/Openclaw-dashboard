import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { AGENTS } from '@/lib/agents';
import { HOME, AGENTS_DIR } from '@/lib/paths';

export async function GET() {
  const byAgent: Record<string, number> = {};
  const timeMap: Record<string, number> = {};
  const stateDistribution: Record<string, number> = {};

  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    timeMap[d.toISOString().slice(0, 10)] = 0;
  }

  // Token stats + time series from JSONL, and state distribution -- run in parallel
  const tokenStatsPromise = (async () => {
    try {
      const agentDirs = await readdir(AGENTS_DIR);
      await Promise.all(agentDirs.map(async (agentDir) => {
        const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
        let total = 0;
        try {
          const files = await readdir(sessDir);
          const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).slice(-5);
          await Promise.all(jsonlFiles.map(async (file) => {
            const filePath = path.join(sessDir, file);
            try {
              const [fileStat, content] = await Promise.all([
                stat(filePath),
                readFile(filePath, 'utf-8'),
              ]);
              const fileDate = fileStat.mtime.toISOString().slice(0, 10);
              let fileTokens = 0;
              for (const line of content.trim().split('\n')) {
                try {
                  const obj = JSON.parse(line);
                  if (obj.usage?.total_tokens) {
                    total += obj.usage.total_tokens;
                    fileTokens += obj.usage.total_tokens;
                  }
                } catch {}
              }
              if (fileDate in timeMap) {
                timeMap[fileDate] += fileTokens;
              }
            } catch {}
          }));
        } catch {}
        byAgent[agentDir] = total;
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

  return NextResponse.json({ byAgent, timeSeries, stateDistribution });
}

export const dynamic = 'force-dynamic';

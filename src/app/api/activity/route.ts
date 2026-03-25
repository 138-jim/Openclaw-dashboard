import { NextResponse } from 'next/server';
import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { AGENTS } from '@/lib/agents';
import { HOME, AGENTS_DIR } from '@/lib/paths';

interface ActivityEvent {
  id: string;
  agent: string;
  emoji: string;
  event: string;
  state: string;
  timestamp: string;
}

export async function GET() {
  const events: ActivityEvent[] = [];
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const stateEvents = await Promise.all(
    AGENTS.map(async (a): Promise<ActivityEvent | null> => {
      const stateFile = path.join(HOME, `.openclaw/workspace-${a.label}/star_state.json`);
      try {
        const raw = await readFile(stateFile, 'utf-8');
        const data = JSON.parse(raw);
        const state = data.state || 'idle';
        if (state === 'idle') return null;
        return {
          id: `state-${a.label}-${data.updated_at || ''}`,
          agent: a.name,
          emoji: a.emoji,
          event: `Agent ${a.name} is ${state}`,
          state,
          timestamp: data.updated_at || new Date().toISOString(),
        };
      } catch {
        return null;
      }
    })
  );
  for (const e of stateEvents) {
    if (e) events.push(e);
  }

  try {
    const agentDirs = await readdir(AGENTS_DIR);
    for (const agentDir of agentDirs.slice(0, 20)) {
      const config = AGENTS.find(a => a.label === agentDir);
      if (!config) continue;
      const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
      try {
        const files = await readdir(sessDir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        for (const file of jsonlFiles) {
          try {
            const fp = path.join(sessDir, file);
            const s = await stat(fp);
            if (s.mtime.getTime() > oneHourAgo) {
              events.push({
                id: `session-${agentDir}-${file}`,
                agent: config.name,
                emoji: config.emoji,
                event: `Agent ${config.name} started a session`,
                state: 'executing',
                timestamp: s.mtime.toISOString(),
              });
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}

  const seen = new Set<string>();
  const unique = events.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  unique.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return NextResponse.json(unique.slice(0, 20));
}

export const dynamic = 'force-dynamic';

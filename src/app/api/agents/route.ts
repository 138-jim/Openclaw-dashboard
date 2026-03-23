import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { AGENTS, AgentState } from '@/lib/agents';

const HOME = process.env.HOME || '/Users/bellette';

export async function GET() {
  const agents: AgentState[] = await Promise.all(
    AGENTS.map(async (a) => {
      const stateFile = path.join(HOME, `.openclaw/workspace-${a.label}/star_state.json`);
      try {
        const raw = await readFile(stateFile, 'utf-8');
        const data = JSON.parse(raw);
        return { ...a, state: data.state || 'idle', detail: data.detail || '', updated_at: data.updated_at || '' };
      } catch {
        return { ...a, state: 'idle', detail: 'No state file', updated_at: '' };
      }
    })
  );
  return NextResponse.json(agents);
}

export const dynamic = 'force-dynamic';

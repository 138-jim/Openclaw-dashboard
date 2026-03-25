import { NextResponse } from 'next/server';
import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { AGENTS, AgentState } from '@/lib/agents';
import { HOME, AGENTS_DIR } from '@/lib/paths';

const ACTIVE_WINDOW = 15 * 60 * 1000; // 15 minutes

async function getRecentSessionActivity(agentLabel: string): Promise<{ active: boolean; lastFile: string; mtime: Date } | null> {
  try {
    const sessDir = path.join(AGENTS_DIR, agentLabel, 'sessions');
    const files = await readdir(sessDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    // Check the most recent file
    let latest: { file: string; mtime: Date } | null = null;
    for (const file of jsonlFiles.slice(-5)) {
      try {
        const s = await stat(path.join(sessDir, file));
        if (!latest || s.mtime > latest.mtime) {
          latest = { file, mtime: s.mtime };
        }
      } catch {}
    }
    if (!latest) return null;

    const isActive = Date.now() - latest.mtime.getTime() < ACTIVE_WINDOW;
    return { active: isActive, lastFile: latest.file, mtime: latest.mtime };
  } catch {
    return null;
  }
}

export async function GET() {
  const agents: AgentState[] = await Promise.all(
    AGENTS.map(async (a) => {
      const stateFile = path.join(HOME, `.openclaw/workspace-${a.label}/star_state.json`);
      let state = 'idle';
      let detail = '';
      let updated_at = '';

      try {
        const raw = await readFile(stateFile, 'utf-8');
        const data = JSON.parse(raw);
        state = data.state || 'idle';
        detail = data.detail || '';
        updated_at = data.updated_at || '';
      } catch {
        detail = 'No state file';
      }

      // If star_state says idle but there's very recent session activity,
      // the agent is likely active — star_state may not have been updated
      if (state === 'idle') {
        const activity = await getRecentSessionActivity(a.label);
        if (activity?.active) {
          state = 'executing';
          detail = detail === 'Standing by' || detail === 'No state file'
            ? 'Processing...'
            : detail;
          updated_at = activity.mtime.toISOString();
        }
      }

      return { ...a, state, detail, updated_at };
    })
  );
  return NextResponse.json(agents);
}

export const dynamic = 'force-dynamic';

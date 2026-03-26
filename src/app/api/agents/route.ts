import { NextResponse } from 'next/server';
import { readFile, readdir, stat } from 'fs/promises';
import path from 'path';
import { AGENTS, AgentState } from '@/lib/agents';
import { HOME, AGENTS_DIR } from '@/lib/paths';

const ACTIVE_WINDOW = 15 * 60 * 1000; // 15 minutes

// Clean cron metadata and raw technical text from detail strings
function cleanDetail(text: string): string {
  if (!text) return text;
  // Strip cron identifiers: [cron:uuid Name (schedule)] → just the name
  let cleaned = text.replace(/\[cron:[a-f0-9-]+\s+([^\]]+?)(?:\s*\([^)]*\))?\]\s*/gi, '$1: ');
  // Strip UUIDs
  cleaned = cleaned.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '');
  // Strip file paths
  cleaned = cleaned.replace(/\/Users\/\S+/g, '');
  cleaned = cleaned.replace(/\/home\/\S+/g, '');
  // Strip message_id / reply_to_id metadata
  cleaned = cleaned.replace(/"?message_id"?\s*:\s*"?[\d."]+"?,?\s*/g, '');
  cleaned = cleaned.replace(/"?reply_to_id"?\s*:\s*"?[\d."]+"?,?\s*/g, '');
  // Strip "Conversation info (untrusted metadata):" prefix
  cleaned = cleaned.replace(/Conversation info \(untrusted metadata\):\s*/g, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Detect remaining raw technical text that still looks bad after cleaning
function isRawTechnical(text: string): boolean {
  if (!text || text.length < 20) return false;
  const indicators = [
    /\{.*".*":/, /^\[?\d{4}-\d{2}-\d{2}/,
    /\.json[l]?\b/, /\.ts\b/, /\.js\b/, /node_modules/,
    /\bfunction\b.*\(/, /\bconst\b.*=/, /\bawait\b/, /\bimport\b.*from/,
    /\bstdout\b/, /\bstderr\b/, /\bpid\b.*\d/,
    /https?:\/\/\S{40,}/, /\b[A-Za-z0-9_]{30,}\b/,
  ];
  let hits = 0;
  for (const re of indicators) {
    if (re.test(text)) hits++;
  }
  return hits >= 2;
}

function friendlyFallback(state: string): string {
  const map: Record<string, string> = {
    writing: 'Writing something up',
    researching: 'Looking into something',
    executing: 'Working on a task',
    syncing: 'Coordinating with the team',
    idle: 'Taking a break',
  };
  return map[state] || 'Working';
}

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

      // Clean cron metadata, then replace remaining raw technical text with a friendly fallback
      const stripped = cleanDetail(detail);
      const finalDetail = isRawTechnical(stripped) ? friendlyFallback(state) : stripped;
      return { ...a, state, detail: finalDetail, updated_at };
    })
  );
  return NextResponse.json(agents);
}

export const dynamic = 'force-dynamic';

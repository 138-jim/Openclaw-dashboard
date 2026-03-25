import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { AGENTS } from '@/lib/agents';
import { generateConversations } from '@/lib/conversations';
import { HOME } from '@/lib/paths';

export async function GET() {
  const agents = await Promise.all(
    AGENTS.map(async (a) => {
      const stateFile = path.join(HOME, `.openclaw/workspace-${a.label}/star_state.json`);
      try {
        const raw = await readFile(stateFile, 'utf-8');
        const data = JSON.parse(raw);
        return { label: a.label, name: a.name, state: data.state || 'idle' };
      } catch {
        return { label: a.label, name: a.name, state: 'idle' };
      }
    })
  );

  const conversations = generateConversations(agents);
  return NextResponse.json(conversations);
}

export const dynamic = 'force-dynamic';

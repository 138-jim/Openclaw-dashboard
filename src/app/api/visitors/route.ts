import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { SlackVisitor } from '@/lib/visitors';
import { AGENTS_DIR } from '@/lib/paths';

const TEN_MINUTES_MS = 10 * 60 * 1000;

export async function GET() {
  const visitors = new Map<string, SlackVisitor>();
  const cutoff = Date.now() - TEN_MINUTES_MS;

  try {
    const agentDirs = await readdir(AGENTS_DIR);

    await Promise.all(agentDirs.map(async (agentDir) => {
      const sessionsFile = path.join(AGENTS_DIR, agentDir, 'sessions', 'sessions.json');
      try {
        const raw = await readFile(sessionsFile, 'utf-8');
        const sessions: unknown[] = JSON.parse(raw);

        for (const session of sessions) {
          const s = session as Record<string, unknown>;
          const updatedAt = s.updatedAt as number | undefined;
          if (!updatedAt || updatedAt * 1000 < cutoff) continue;

          const origin = s.origin as Record<string, unknown> | undefined;
          if (!origin) continue;

          const provider = (origin.provider as string) || '';
          const surface = (origin.surface as string) || '';
          if (provider !== 'slack' && surface !== 'slack' && surface !== 'webchat') continue;

          const id = String(origin.from || origin.label || '');
          if (!id) continue;

          const existing = visitors.get(id);
          const lastActive = new Date(updatedAt * 1000).toISOString();

          // Try to extract avatar URL from origin metadata
          const avatarUrl = (origin.avatarUrl as string)
            || (origin.avatar as string)
            || (origin.icon as string)
            || (origin.profileImage as string)
            || undefined;

          if (!existing || existing.lastActive < lastActive) {
            visitors.set(id, {
              id,
              name: String(origin.label || id),
              provider: provider || surface,
              targetAgent: agentDir,
              lastActive,
              surface: surface || provider,
              avatarUrl: avatarUrl || existing?.avatarUrl,
            });
          }
        }
      } catch {
        // sessions.json missing or malformed — skip this agent
      }
    }));
  } catch {
    // AGENTS_DIR missing — return empty
  }

  return NextResponse.json(Array.from(visitors.values()));
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { SlackVisitor } from '@/lib/visitors';
import { AGENTS_DIR } from '@/lib/paths';

const TEN_MINUTES_MS = 10 * 60 * 1000;
function getSlackToken() { return process.env.SLACK_BOT_TOKEN || ''; }

// Cache Slack user profiles to avoid hammering the API
const userProfileCache = new Map<string, { name: string; avatarUrl: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function resolveSlackUser(userId: string): Promise<{ name: string; avatarUrl: string }> {
  // Strip prefixes like "slack:" from the ID
  const cleanId = userId.replace(/^slack:/, '').replace(/^channel:/, '');

  // Check cache
  const cached = userProfileCache.get(cleanId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return { name: cached.name, avatarUrl: cached.avatarUrl };
  }

  const SLACK_BOT_TOKEN = getSlackToken();
  if (!SLACK_BOT_TOKEN) {
    return { name: cleanId, avatarUrl: '' };
  }

  try {
    if (cleanId.startsWith('U')) {
      // User ID
      const res = await fetch(`https://slack.com/api/users.info?user=${cleanId}`, {
        headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        const profile = data.user.profile || {};
        const name = profile.display_name || data.user.real_name || data.user.name || cleanId;
        const avatarUrl = profile.image_72 || profile.image_48 || '';
        userProfileCache.set(cleanId, { name, avatarUrl, cachedAt: Date.now() });
        return { name, avatarUrl };
      } else {
        console.error(`Slack users.info failed for ${cleanId}:`, data.error || 'unknown');
      }
    } else if (cleanId.startsWith('C') || cleanId.startsWith('G')) {
      // Channel or group ID — try to get channel name
      const res = await fetch(`https://slack.com/api/conversations.info?channel=${cleanId}`, {
        headers: { 'Authorization': `Bearer ${SLACK_BOT_TOKEN}` },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      if (data.ok && data.channel) {
        const name = `#${data.channel.name}`;
        userProfileCache.set(cleanId, { name, avatarUrl: '', cachedAt: Date.now() });
        return { name, avatarUrl: '' };
      }
      // Fallback for channels
      const channelName = cleanId.startsWith('C') ? 'Channel visitor' : 'Group visitor';
      userProfileCache.set(cleanId, { name: channelName, avatarUrl: '', cachedAt: Date.now() });
      return { name: channelName, avatarUrl: '' };
    }
  } catch (err) {
    console.error(`Slack resolve error for ${cleanId}:`, err);
  }

  return { name: cleanId, avatarUrl: '' };
}

export async function GET() {
  const visitors = new Map<string, SlackVisitor>();
  const cutoff = Date.now() - TEN_MINUTES_MS;

  try {
    const agentDirs = await readdir(AGENTS_DIR);

    await Promise.all(agentDirs.map(async (agentDir) => {
      const sessionsFile = path.join(AGENTS_DIR, agentDir, 'sessions', 'sessions.json');
      try {
        const raw = await readFile(sessionsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const sessions: unknown[] = Array.isArray(parsed) ? parsed : Object.values(parsed);

        for (const session of sessions) {
          const s = session as Record<string, unknown>;
          const updatedAt = s.updatedAt as number | undefined;
          if (!updatedAt) continue;
          const updatedMs = updatedAt > 1e12 ? updatedAt : updatedAt * 1000;
          if (updatedMs < cutoff) continue;

          const origin = s.origin as Record<string, unknown> | undefined;
          if (!origin) continue;

          const provider = (origin.provider as string) || '';
          const surface = (origin.surface as string) || '';
          if (provider !== 'slack' && surface !== 'slack' && surface !== 'webchat') continue;

          const id = String(origin.from || origin.label || '');
          if (!id) continue;

          const existing = visitors.get(id);
          const lastActive = new Date(updatedMs).toISOString();

          if (!existing || existing.lastActive < lastActive) {
            visitors.set(id, {
              id,
              name: id, // placeholder — resolved below
              provider: provider || surface,
              targetAgent: agentDir,
              lastActive,
              surface: surface || provider,
              avatarUrl: '',
            });
          }
        }
      } catch {}
    }));
  } catch {}

  // Resolve Slack user profiles in parallel
  const visitorList = Array.from(visitors.values());
  await Promise.all(visitorList.map(async (v) => {
    const profile = await resolveSlackUser(v.id);
    v.name = profile.name;
    // Proxy avatar through our API to avoid CORS issues
    const rawUrl = profile.avatarUrl || v.avatarUrl;
    v.avatarUrl = rawUrl ? `/api/avatar?url=${encodeURIComponent(rawUrl)}` : '';
  }));

  return NextResponse.json(visitorList);
}

export const dynamic = 'force-dynamic';

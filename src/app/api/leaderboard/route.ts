import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { AGENTS_DIR } from '@/lib/paths';

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 0.80, output: 4 },
  'gemini-3-flash-preview': { input: 0.15, output: 0.60 },
  'gemini-3-pro-preview': { input: 1.25, output: 5 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 5 },
  'gpt-5.1-codex': { input: 2.50, output: 10 },
};
const DEFAULT_PRICING = { input: 3, output: 15 };

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
  return (inputTokens / 1_000_000 * pricing.input) + (outputTokens / 1_000_000 * pricing.output);
}

function getSlackToken() { return process.env.SLACK_BOT_TOKEN || ''; }

// Cache user profiles
const profileCache = new Map<string, { name: string; avatarUrl: string; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

async function resolveUser(userId: string): Promise<{ name: string; avatarUrl: string }> {
  const cleanId = userId.replace(/^slack:/, '').replace(/^channel:/, '');
  const cached = profileCache.get(cleanId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached;

  const token = getSlackToken();
  if (!token) return { name: cleanId, avatarUrl: '' };

  try {
    if (cleanId.startsWith('U')) {
      const res = await fetch(`https://slack.com/api/users.info?user=${cleanId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        const profile = data.user.profile || {};
        const name = profile.display_name || data.user.real_name || data.user.name || cleanId;
        const avatarUrl = profile.image_72 || '';
        const result = { name, avatarUrl: avatarUrl ? `/api/avatar?url=${encodeURIComponent(avatarUrl)}` : '' };
        profileCache.set(cleanId, { ...result, cachedAt: Date.now() });
        return result;
      }
    } else if (cleanId.startsWith('C') || cleanId.startsWith('G') || cleanId.startsWith('group:')) {
      const channelId = cleanId.replace(/^group:/, '');
      const res = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      const data = await res.json();
      if (data.ok && data.channel) {
        const result = { name: `#${data.channel.name}`, avatarUrl: '' };
        profileCache.set(cleanId, { ...result, cachedAt: Date.now() });
        return result;
      }
    }
  } catch {}
  return { name: cleanId, avatarUrl: '' };
}

export async function GET() {
  const userStats = new Map<string, { tokens: number; sessions: number; cost: number; agents: Set<string> }>();

  try {
    const agentDirs = await readdir(AGENTS_DIR);
    await Promise.all(agentDirs.map(async (agentDir) => {
      const sessionsFile = path.join(AGENTS_DIR, agentDir, 'sessions', 'sessions.json');
      try {
        const raw = await readFile(sessionsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const sessions: any[] = Array.isArray(parsed) ? parsed : Object.values(parsed);

        for (const s of sessions) {
          const from = s.origin?.from || '';
          if (!from) continue;

          const existing = userStats.get(from) || { tokens: 0, sessions: 0, cost: 0, agents: new Set() };
          existing.tokens += s.totalTokens || 0;
          existing.sessions += 1;
          existing.cost += calculateCost(s.model || 'unknown', s.inputTokens || 0, s.outputTokens || 0);
          existing.agents.add(agentDir);
          userStats.set(from, existing);
        }
      } catch {}
    }));
  } catch {}

  // Resolve names in parallel
  const entries = Array.from(userStats.entries());
  const resolved = await Promise.all(entries.map(async ([userId, stats]) => {
    const profile = await resolveUser(userId);
    return {
      id: userId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      tokens: stats.tokens,
      sessions: stats.sessions,
      cost: Math.round(stats.cost * 100) / 100,
      agentCount: stats.agents.size,
    };
  }));

  // Sort by tokens descending
  resolved.sort((a, b) => b.tokens - a.tokens);

  return NextResponse.json(resolved.slice(0, 20));
}

export const dynamic = 'force-dynamic';

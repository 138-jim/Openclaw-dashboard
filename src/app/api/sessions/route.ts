import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { AGENTS_DIR } from '@/lib/paths';

interface SessionInfo {
  agent: string; file: string; lastMessage: string; timestamp: string; tokenUsage: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const filterAgent = url.searchParams.get('agent');
  const sessions: SessionInfo[] = [];

  try {
    const agentDirs = await readdir(AGENTS_DIR);
    for (const agentDir of agentDirs.slice(0, 20)) {
      if (filterAgent && agentDir !== filterAgent) continue;
      const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
      try {
        const files = await readdir(sessDir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).slice(-10);
        for (const file of jsonlFiles) {
          try {
            const fp = path.join(sessDir, file);
            const s = await stat(fp);
            const content = await readFile(fp, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            let lastMsg = '', tokens = 0;
            for (const line of lines.slice(-20)) {
              try {
                const obj = JSON.parse(line);
                if (obj.content) lastMsg = String(obj.content).slice(0, 100);
                if (obj.usage?.total_tokens) tokens += obj.usage.total_tokens;
              } catch {}
            }
            sessions.push({
              agent: agentDir, file, lastMessage: lastMsg,
              timestamp: s.mtime.toISOString(), tokenUsage: tokens,
            });
          } catch {}
        }
      } catch {}
    }
  } catch {}

  sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return NextResponse.json(sessions.slice(0, 50));
}

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { AGENTS_DIR } from '@/lib/paths';

export async function GET() {
  const stats: Record<string, number> = {};
  try {
    const agentDirs = await readdir(AGENTS_DIR);
    for (const agentDir of agentDirs) {
      const sessDir = path.join(AGENTS_DIR, agentDir, 'sessions');
      let total = 0;
      try {
        const files = await readdir(sessDir);
        for (const file of files.filter(f => f.endsWith('.jsonl')).slice(-5)) {
          try {
            const content = await readFile(path.join(sessDir, file), 'utf-8');
            for (const line of content.trim().split('\n')) {
              try {
                const obj = JSON.parse(line);
                if (obj.usage?.total_tokens) total += obj.usage.total_tokens;
              } catch {}
            }
          } catch {}
        }
      } catch {}
      stats[agentDir] = total;
    }
  } catch {}
  return NextResponse.json(stats);
}

export const dynamic = 'force-dynamic';

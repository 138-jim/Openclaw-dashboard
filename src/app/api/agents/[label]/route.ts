import { NextResponse } from 'next/server';
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import { AGENTS_DIR } from '@/lib/paths';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ label: string }> }
) {
  const { label } = await params;
  const sessDir = path.join(AGENTS_DIR, label, 'sessions');

  let sessionCount = 0;
  let totalTokens = 0;
  const tokenHistory: number[] = new Array(24).fill(0);

  try {
    const files = await readdir(sessDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    sessionCount = jsonlFiles.length;

    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    for (const file of jsonlFiles.slice(-20)) {
      try {
        const fp = path.join(sessDir, file);
        const fileStat = await stat(fp);
        const content = await readFile(fp, 'utf-8');
        const lines = content.trim().split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            const tokens = obj.usage?.total_tokens || 0;
            if (tokens === 0) continue;

            totalTokens += tokens;

            const ts = obj.timestamp
              ? new Date(obj.timestamp).getTime()
              : fileStat.mtime.getTime();

            if (ts >= twentyFourHoursAgo && ts <= now) {
              const hoursAgo = Math.floor((now - ts) / (60 * 60 * 1000));
              const bucket = 23 - Math.min(hoursAgo, 23);
              tokenHistory[bucket] += tokens;
            }
          } catch { /* skip malformed lines */ }
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* agent dir may not exist */ }

  return NextResponse.json({ tokenHistory, sessionCount, totalTokens });
}

export const dynamic = 'force-dynamic';

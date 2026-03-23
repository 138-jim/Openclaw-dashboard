import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const res = await fetch('http://127.0.0.1:18789/health', { signal: AbortSignal.timeout(3000) });
    const ok = res.ok;
    return NextResponse.json({ status: ok ? 'healthy' : 'unhealthy', code: res.status });
  } catch {
    return NextResponse.json({ status: 'unreachable', code: 0 });
  }
}

export const dynamic = 'force-dynamic';

#!/usr/bin/env npx tsx
/**
 * Agent Monitor — uses MiniMax 2.7 to observe agent sessions and
 * auto-update star_state.json so the dashboard stays current.
 *
 * Usage:
 *   MINIMAX_API_KEY=your_key npx tsx src/monitor/agent-monitor.ts
 *
 * Or set MINIMAX_API_KEY in .env.local
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import path from 'path';

// Load .env.local synchronously
import { readFileSync } from 'fs';
try {
  const envPath = path.join(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch {}

// ─── Config ──────────────────────────────────────────────────────────────────
const HOME = process.env.HOME || '/Users/bellette';
const AGENTS_DIR = path.join(HOME, '.openclaw/agents');
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || '';
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1';
const POLL_INTERVAL = 500; // 0.5 seconds
const TAIL_LINES = 50; // Read last N lines of session file
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes — consider agent active if session modified within this

const AGENTS = [
  'main','penny','desk','hex','nooshbot','pipeline','feedhive','quill',
  'scout','axel','hal','grace','lex','ada','ivy','tess','cole','dash','miles','sloane',
];

const VALID_STATES = ['idle', 'writing', 'researching', 'executing', 'syncing'] as const;

// Track last-seen file modification times to avoid re-analyzing unchanged files
const lastSeen = new Map<string, number>();

// ─── MiniMax 2.7 API ────────────────────────────────────────────────────────
async function classifyWithMinimax(agentLabel: string, recentMessages: string): Promise<{ state: string; detail: string }> {
  if (!MINIMAX_API_KEY) {
    // Fallback: simple heuristic classification without API
    return classifyHeuristic(recentMessages);
  }

  try {
    const res = await fetch(`${MINIMAX_BASE_URL}/text/chatcompletion_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M1-80k',
        messages: [
          {
            role: 'system',
            content: `Classify what an AI agent is doing. Respond in exactly this format (two lines):

STATE: <one of: idle, writing, researching, executing, syncing>
DETAIL: <a full paragraph describing what the agent is working on>

The DETAIL line must be a complete paragraph of 2-3 sentences describing the task with full context.

State meanings: idle=done/finished, writing=composing text, researching=gathering info, executing=running tasks, syncing=coordinating.
IMPORTANT: Never use "error" as a state. Even if the agent is discussing errors, crashes, or bugs — classify based on what the agent is DOING (e.g. "executing" if debugging, "writing" if composing a fix).

If the agent finished and said goodbye, use STATE: idle with DETAIL: Task completed.`
          },
          {
            role: 'user',
            content: `Agent "${agentLabel}" recent conversation:\n\n${recentMessages}`
          }
        ],
        temperature: 0.1,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.error(`MiniMax API error: ${res.status} ${res.statusText}`);
      return classifyHeuristic(recentMessages);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Try JSON format first
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const state = VALID_STATES.includes(parsed.state) ? parsed.state : 'executing';
        const detail = String(parsed.detail || '');
        if (detail.length > 5) return { state, detail };
      } catch {}
    }

    // Try STATE:/DETAIL: line format
    const stateMatch = content.match(/STATE:\s*(idle|writing|researching|executing|syncing|error)/i);
    const detailMatch = content.match(/DETAIL:\s*(.+)/i);
    if (stateMatch) {
      const state = stateMatch[1].toLowerCase();
      // Grab everything after DETAIL: including newlines
      const detailIdx = content.indexOf('DETAIL:');
      const detail = detailIdx >= 0 ? content.slice(detailIdx + 7).trim() : (detailMatch?.[1] || '');
      if (VALID_STATES.includes(state)) return { state, detail };
    }

    return classifyHeuristic(recentMessages);
  } catch (err) {
    console.error(`MiniMax classify error for ${agentLabel}:`, err);
    return classifyHeuristic(recentMessages);
  }
}

// ─── Heuristic fallback (no API key) ─────────────────────────────────────────
function classifyHeuristic(text: string): { state: string; detail: string } {
  const lower = text.toLowerCase();

  // Try to extract a meaningful snippet for the detail
  const lines = text.split('\n').filter(l => l.trim().length > 10);
  const snippet = lines.length > 0
    ? lines[lines.length - 1].trim().slice(0, 50).replace(/[^a-zA-Z0-9 .,!?#@\-_/]/g, '').trim()
    : '';

  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception') || lower.includes('traceback')) {
    return { state: 'error', detail: snippet || 'Error detected in recent activity' };
  }
  if (lower.includes('writing') || lower.includes('draft') || lower.includes('compose') || lower.includes('editing') || lower.includes('message')) {
    return { state: 'writing', detail: snippet || 'Writing content' };
  }
  if (lower.includes('search') || lower.includes('research') || lower.includes('looking') || lower.includes('reading') || lower.includes('finding')) {
    return { state: 'researching', detail: snippet || 'Researching' };
  }
  if (lower.includes('sync') || lower.includes('coordinate') || lower.includes('handoff') || lower.includes('passing to') || lower.includes('slack')) {
    return { state: 'syncing', detail: snippet || 'Syncing with other agents' };
  }
  if (lower.includes('running') || lower.includes('executing') || lower.includes('deploy') || lower.includes('building') || lower.includes('command') || lower.includes('code')) {
    return { state: 'executing', detail: snippet || 'Running tasks' };
  }

  // If there's content at all, assume executing with a snippet
  if (text.trim().length > 50) {
    return { state: 'executing', detail: snippet || 'Working on task' };
  }

  return { state: 'idle', detail: 'Standing by' };
}

// ─── Read latest messages from session files ─────────────────────────────────
async function getRecentMessages(agentLabel: string): Promise<{ text: string; mtime: number } | null> {
  try {
    const sessDir = path.join(AGENTS_DIR, agentLabel, 'sessions');
    const files = await readdir(sessDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) return null;

    // Find most recently modified file
    const results = await Promise.all(jsonlFiles.map(async (file) => {
      try {
        const s = await stat(path.join(sessDir, file));
        return { file, mtime: s.mtime.getTime() };
      } catch { return { file, mtime: 0 }; }
    }));

    let latestFile = '';
    let latestMtime = 0;
    for (const r of results) {
      if (r.mtime > latestMtime) {
        latestMtime = r.mtime;
        latestFile = r.file;
      }
    }

    if (!latestFile) return null;

    const content = await readFile(path.join(sessDir, latestFile), 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    const tail = lines.slice(-TAIL_LINES);

    // Extract message content from JSONL lines
    const messages: string[] = [];
    for (const line of tail) {
      try {
        const obj = JSON.parse(line);

        // The message field can be an object or a stringified object
        let msg = obj.message;
        if (typeof msg === 'string') {
          try { msg = JSON.parse(msg); } catch { /* keep as string */ }
        }

        if (msg && typeof msg === 'object') {
          const role = msg.role || '';
          // Skip tool results — they contain file paths, not useful content
          if (role === 'toolResult' || role === 'tool') continue;
          const content = msg.content;

          // Strip control tags from text
          const cleanText = (t: string) => t
            .replace(/<\/?final>/g, '')
            .replace(/\[\[[\w_]+\]\]/g, '')
            .replace(/<\/?[\w-]+>/g, '')
            .trim();

          if (typeof content === 'string' && role !== 'toolResult') {
            const cleaned = cleanText(content);
            if (cleaned.length > 10) {
              messages.push(cleaned.slice(0, 300));
            }
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text' && block.text) {
                const cleaned = cleanText(String(block.text));
                if (cleaned.length > 10) {
                  messages.push(cleaned.slice(0, 300));
                }
              } else if (block.type === 'thinking' && block.thinking) {
                const cleaned = cleanText(String(block.thinking));
                if (cleaned.length > 10) {
                  messages.push(cleaned.slice(0, 300));
                }
              }
            }
          }
        } else if (obj.content) {
          messages.push(String(obj.content).slice(0, 200));
        }
      } catch {}
    }

    return { text: messages.join('\n').slice(0, 3000), mtime: latestMtime };
  } catch {
    return null;
  }
}

// ─── Update star_state.json ──────────────────────────────────────────────────
async function updateState(agentLabel: string, state: string, detail: string) {
  // NEVER set error state from the monitor — error is only for system failures
  const safeState = state === 'error' ? 'executing' : state;

  const wsDir = path.join(HOME, `.openclaw/workspace-${agentLabel}`);
  const stateFile = path.join(wsDir, 'star_state.json');

  const data = {
    state: safeState,
    detail,
    updated_at: new Date().toISOString(),
  };

  try {
    // Ensure workspace dir exists
    const { mkdir } = await import('fs/promises');
    await mkdir(wsDir, { recursive: true });
    await writeFile(stateFile, JSON.stringify(data, null, 2) + '\n');
  } catch (err) {
    console.error(`Failed to write state for ${agentLabel}:`, err);
  }
}

// ─── Classify a single agent ─────────────────────────────────────────────────
// Debounce per agent — don't classify the same agent more than once per 3s
const debounceTimers = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_MS = 1500;

async function classifyAgent(agent: string) {
  try {
    const recent = await getRecentMessages(agent);

    if (!recent || !recent.text.trim()) return;

    // Skip if file hasn't changed
    const prevMtime = lastSeen.get(agent) || 0;
    if (recent.mtime <= prevMtime) return;
    lastSeen.set(agent, recent.mtime);

    // MiniMax classifies state; use conversation text as detail
    const classification = await classifyWithMinimax(agent, recent.text);
    // Get the longest lines from the conversation as detail
    const lines = recent.text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 30
        && !l.startsWith('System')
        && !l.startsWith('|')
        && !l.startsWith('[slack')
        && !l.startsWith('slack:')
        && !l.startsWith('Slack')
        && !l.match(/^\[?\d{4}-\d{2}-\d{2}/)
        && !l.startsWith('cron')
        && !l.startsWith('message_id')
      );
    lines.sort((a, b) => b.length - a.length);
    const detail = lines.slice(0, 2).join(' ').slice(0, 500) || classification.detail;
    await updateState(agent, classification.state, detail);

    const apiLabel = MINIMAX_API_KEY ? 'minimax' : 'heuristic';
    console.log(`[${new Date().toLocaleTimeString()}] ${agent}: ${classification.state} — ${classification.detail} (${apiLabel})`);
  } catch (err) {
    console.error(`Error classifying ${agent}:`, err);
  }
}

function debouncedClassify(agent: string) {
  const existing = debounceTimers.get(agent);
  if (existing) clearTimeout(existing);
  debounceTimers.set(agent, setTimeout(() => classifyAgent(agent), DEBOUNCE_MS));
}

// ─── File watcher via chokidar — watches session directories ─────────────────
import chokidar from 'chokidar';

function startWatcher() {
  // Watch each agent's sessions directory directly (not globs)
  const watchDirs = AGENTS
    .map(a => path.join(AGENTS_DIR, a, 'sessions'))
    .filter(d => { try { require('fs').statSync(d); return true; } catch { return false; } });

  const watcher = chokidar.watch(watchDirs, {
    ignoreInitial: true,
    // usePolling on macOS to detect appends to existing files
    usePolling: true,
    interval: 500,
    binaryInterval: 500,
    ignored: (p: string) => !p.endsWith('.jsonl') && !p.endsWith('sessions'),
  });

  watcher.on('change', (filePath: string) => {
    const parts = filePath.split(path.sep);
    const sessIdx = parts.indexOf('sessions');
    if (sessIdx > 0) {
      const agent = parts[sessIdx - 1];
      if (AGENTS.includes(agent)) {
        debouncedClassify(agent);
      }
    }
  });

  watcher.on('add', (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return;
    const parts = filePath.split(path.sep);
    const sessIdx = parts.indexOf('sessions');
    if (sessIdx > 0) {
      const agent = parts[sessIdx - 1];
      if (AGENTS.includes(agent)) {
        debouncedClassify(agent);
      }
    }
  });

  return watcher;
}

// ─── Idle checker — marks agents idle when no changes for ACTIVE_WINDOW_MS ───
async function idleCheck() {
  for (const agent of AGENTS) {
    try {
      const recent = await getRecentMessages(agent);
      if (!recent) continue;
      const ageMs = Date.now() - recent.mtime;
      if (ageMs > ACTIVE_WINDOW_MS) {
        // Check if currently non-idle — if so, set to idle
        const wsDir = path.join(HOME, `.openclaw/workspace-${agent}`);
        const stateFile = path.join(wsDir, 'star_state.json');
        try {
          const raw = await readFile(stateFile, 'utf-8');
          const data = JSON.parse(raw);
          if (data.state && data.state !== 'idle') {
            await updateState(agent, 'idle', 'Standing by');
            console.log(`[${new Date().toLocaleTimeString()}] ${agent}: idle — Standing by (was ${data.state})`);
          }
        } catch {}
      }
    } catch {}
  }
}

async function main() {
  console.log('🔍 OpenClaw Agent Monitor');
  console.log(`   MiniMax API: ${MINIMAX_API_KEY ? 'configured ✓' : 'not set — using heuristic fallback'}`);
  console.log(`   Agents dir: ${AGENTS_DIR}`);
  console.log(`   Debounce: ${DEBOUNCE_MS}ms | Idle after: ${ACTIVE_WINDOW_MS / 60000}min`);
  console.log('');

  // Initial scan — only classify agents with very recent activity (last 2 min)
  // For the rest, trust the existing star_state.json and just record lastSeen
  for (const agent of AGENTS) {
    const recent = await getRecentMessages(agent);
    if (recent) {
      lastSeen.set(agent, recent.mtime);
      const ageMs = Date.now() - recent.mtime;
      if (ageMs < 2 * 60 * 1000) {
        // Very recent — classify now
        const classification = await classifyWithMinimax(agent, recent.text);
        const initLines = recent.text.split('\n').filter(l => l.trim().length > 20);
        const initExcerpt = initLines.slice(-3).map(l => l.trim()).join(' ');
        await updateState(agent, classification.state, initExcerpt.length > 20 ? initExcerpt : classification.detail);
        const apiLabel = MINIMAX_API_KEY ? 'minimax' : 'heuristic';
        console.log(`[${new Date().toLocaleTimeString()}] ${agent}: ${classification.state} — ${classification.detail} (${apiLabel})`);
      }
    }
  }
  console.log('   Initial scan complete (only classified recently active agents).');

  // Start file watcher with polling backend (reliable on macOS)
  startWatcher();
  console.log(`   Watching session directories (chokidar + polling at 500ms)\n`);

  // Periodic idle check (every 60s) — marks stale agents as idle
  setInterval(idleCheck, 60_000);
}

main().catch(console.error);

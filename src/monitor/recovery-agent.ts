#!/usr/bin/env npx tsx
/**
 * OpenClaw Recovery Agent — Intelligent watchdog using Claude Code SDK
 *
 * Monitors:
 * - Gateway health (every 30s)
 * - All 20 agents (every 60s)
 *
 * On failure:
 * - Simple restart first
 * - Claude Agent for smart diagnostics on repeated failure
 * - Slack DM notifications
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx src/monitor/recovery-agent.ts
 */

import { spawn } from 'child_process';
import { readFile, appendFile, stat, mkdir } from 'fs/promises';
import path from 'path';
import { readFileSync } from 'fs';

// Load .env.local
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
const LOG_DIR = path.join(HOME, '.openclaw/logs');
const RECOVERY_LOG = path.join(LOG_DIR, 'recovery.log');
const GATEWAY_URL = 'http://127.0.0.1:18789/health';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_NOTIFY_USER = process.env.SLACK_NOTIFY_USER || ''; // User ID for DMs
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const AGENTS = [
  'main','penny','desk','hex','nooshbot','pipeline','feedhive','quill',
  'scout','axel','hal','grace','lex','ada','ivy','tess','cole','dash','miles','sloane',
];

const GATEWAY_CHECK_INTERVAL = 30_000;  // 30 seconds
const AGENT_CHECK_INTERVAL = 60_000;    // 60 seconds
const STUCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

let gatewayFailCount = 0;
let isRecovering = false;

// ─── Logging ─────────────────────────────────────────────────────────────────
async function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    await mkdir(LOG_DIR, { recursive: true });
    await appendFile(RECOVERY_LOG, line + '\n');
  } catch {}
}

// ─── Slack Notifications ─────────────────────────────────────────────────────
async function notifySlack(message: string) {
  if (!SLACK_BOT_TOKEN) return;

  try {
    // Open a DM conversation with the user
    let channel = SLACK_NOTIFY_USER;
    if (channel && channel.startsWith('U')) {
      const openRes = await fetch('https://slack.com/api/conversations.open', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: channel }),
        signal: AbortSignal.timeout(5000),
      });
      const openData = await openRes.json();
      if (openData.ok) channel = openData.channel.id;
    }

    if (!channel) return;

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel,
        text: `🔧 *OpenClaw Recovery*\n${message}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    await log(`Slack notification failed: ${err}`);
  }
}

// ─── Gateway Health Check ────────────────────────────────────────────────────
async function checkGateway(): Promise<boolean> {
  try {
    const res = await fetch(GATEWAY_URL, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function simpleRestart(): Promise<boolean> {
  await log('Attempting simple gateway restart...');
  return new Promise((resolve) => {
    const proc = spawn('openclaw', ['gateway', 'restart'], { stdio: 'pipe' });
    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); });
    proc.on('close', async (code) => {
      await log(`Restart exit code: ${code}, output: ${output.slice(0, 200)}`);
      // Wait 5s then check health
      await new Promise(r => setTimeout(r, 5000));
      resolve(await checkGateway());
    });
    proc.on('error', async (err) => {
      await log(`Restart spawn error: ${err.message}`);
      resolve(false);
    });
    // Timeout after 30s
    setTimeout(() => { proc.kill(); resolve(false); }, 30000);
  });
}

// ─── Claude Agent Smart Diagnostics ──────────────────────────────────────────
async function runClaudeAgent(prompt: string, maxTurns = 15): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    await log('No ANTHROPIC_API_KEY — skipping Claude Agent diagnostics');
    return 'Skipped: no API key';
  }

  return new Promise((resolve) => {
    const output: string[] = [];
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'text',
      '--max-turns', String(maxTurns),
      '--allowedTools', 'Bash,Read',
      prompt,
    ], {
      env: { ...process.env, ANTHROPIC_API_KEY },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: HOME,
    });

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      output.push(text);
    });
    proc.stderr.on('data', (d) => {
      output.push(`[stderr] ${d.toString()}`);
    });
    proc.on('close', async (code) => {
      const result = output.join('');
      await log(`Claude Agent finished (code ${code}), output length: ${result.length}`);
      resolve(result);
    });
    proc.on('error', async (err) => {
      await log(`Claude Agent spawn error: ${err.message}`);
      resolve(`Error: ${err.message}`);
    });
    // Timeout after 5 minutes
    setTimeout(() => { proc.kill(); resolve(output.join('') + '\n[Timeout after 5 minutes]'); }, 300000);
  });
}

async function smartDiagnoseGateway() {
  if (isRecovering) return;
  isRecovering = true;
  await log('🧠 Spawning Claude Agent for gateway diagnosis...');
  await notifySlack('Gateway is down after multiple restart attempts. Spawning Claude Agent for diagnosis...');

  try {
    const result = await runClaudeAgent(
      `The OpenClaw gateway at ${GATEWAY_URL} is down after multiple restart attempts.

      Please diagnose and fix:
      1. Read the last 100 lines of ${HOME}/.openclaw/logs/gateway.err.log
      2. Read the last 100 lines of ${HOME}/.openclaw/logs/gateway.log
      3. Run: ps aux | grep openclaw-gateway
      4. Run: lsof -i :18789
      5. Check if launchd has the service: launchctl print gui/$(id -u)/ai.openclaw.gateway
      6. Diagnose the root cause from the logs
      7. Fix it — try these in order:
         a. Clear stale sockets: openclaw gateway restart
         b. Kill and reinstall: pkill -f openclaw-gateway && sleep 2 && openclaw gateway install
         c. Check for config issues in ${HOME}/.openclaw/openclaw.json
      8. Verify: curl -s ${GATEWAY_URL}

      Report what you found and what you did to fix it.`
    );

    // Check if it worked
    const recovered = await checkGateway();
    if (recovered) {
      await log('✅ Gateway recovered by Claude Agent');
      await notifySlack(`✅ Gateway recovered!\n\`\`\`${result.slice(0, 500)}\`\`\``);
      gatewayFailCount = 0;
    } else {
      await log('❌ Gateway still down after Claude Agent intervention');
      await notifySlack(`❌ Gateway still down. Claude Agent output:\n\`\`\`${result.slice(0, 500)}\`\`\``);
    }
  } finally {
    isRecovering = false;
  }
}

// ─── Agent Health Check ──────────────────────────────────────────────────────
async function checkAgentHealth(agentLabel: string): Promise<'healthy' | 'stuck' | 'stale'> {
  const stateFile = path.join(HOME, `.openclaw/workspace-${agentLabel}/star_state.json`);
  const sessDir = path.join(AGENTS_DIR, agentLabel, 'sessions');

  try {
    const [stateStat, stateRaw] = await Promise.all([
      stat(stateFile),
      readFile(stateFile, 'utf-8'),
    ]);

    const stateData = JSON.parse(stateRaw);
    const stateAge = Date.now() - stateStat.mtime.getTime();

    // If state is idle and old, that's fine — agent is just idle
    if (stateData.state === 'idle') return 'healthy';

    // If state is active but hasn't been updated in 30+ minutes, agent might be stuck
    if (stateAge > STUCK_THRESHOLD_MS) {
      // Check if there are recent session files (agent was active but state file stopped updating)
      try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(sessDir);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        for (const file of jsonlFiles.slice(-3)) {
          const fileStat = await stat(path.join(sessDir, file));
          if (Date.now() - fileStat.mtime.getTime() < STUCK_THRESHOLD_MS) {
            return 'stuck'; // Has recent sessions but state file is stale
          }
        }
      } catch {}
      return 'stale';
    }

    return 'healthy';
  } catch {
    return 'healthy'; // No state file = idle, not an error
  }
}

async function recoverStuckAgent(agentLabel: string) {
  await log(`🧠 Spawning Claude Agent to recover stuck agent: ${agentLabel}`);
  await notifySlack(`Agent *${agentLabel}* appears stuck. Spawning recovery agent...`);

  const result = await runClaudeAgent(
    `OpenClaw agent "${agentLabel}" appears to be stuck — its state file hasn't updated in 30+ minutes but it has recent session activity.

    Please diagnose and fix:
    1. Check the agent's workspace: ls -la ${HOME}/.openclaw/workspace-${agentLabel}/
    2. Read star_state.json: cat ${HOME}/.openclaw/workspace-${agentLabel}/star_state.json
    3. Check for recent sessions: ls -lt ${AGENTS_DIR}/${agentLabel}/sessions/*.jsonl | head -5
    4. Check auth cooldowns: cat ${AGENTS_DIR}/${agentLabel}/agent/auth-profiles.json | head -20
    5. Clear cooldowns if needed (set usageStats to {})
    6. Try restarting the agent: openclaw agent restart ${agentLabel}
    7. Verify: check if star_state.json gets updated

    Report what you found.`,
    10
  );

  await log(`Agent ${agentLabel} recovery result: ${result.slice(0, 300)}`);
  await notifySlack(`Agent *${agentLabel}* recovery attempt:\n\`\`\`${result.slice(0, 400)}\`\`\``);
}

// ─── Main Loops ──────────────────────────────────────────────────────────────
async function gatewayLoop() {
  const healthy = await checkGateway();

  if (healthy) {
    if (gatewayFailCount > 0) {
      await log(`Gateway recovered after ${gatewayFailCount} failures`);
      gatewayFailCount = 0;
    }
    return;
  }

  gatewayFailCount++;
  await log(`Gateway health check failed (${gatewayFailCount} consecutive)`);

  if (gatewayFailCount === 1) {
    // First failure — just log
    await notifySlack('⚠️ Gateway health check failed. Monitoring...');
  } else if (gatewayFailCount <= 3) {
    // Simple restart
    const recovered = await simpleRestart();
    if (recovered) {
      await log('Gateway recovered via simple restart');
      await notifySlack('✅ Gateway recovered via simple restart');
      gatewayFailCount = 0;
    }
  } else if (gatewayFailCount === 5) {
    // Escalate to Claude Agent
    await smartDiagnoseGateway();
  } else if (gatewayFailCount % 10 === 0) {
    // Re-try Claude Agent every 10 failures
    await smartDiagnoseGateway();
  }
}

async function agentLoop() {
  for (const agent of AGENTS) {
    const health = await checkAgentHealth(agent);
    if (health === 'stuck') {
      await recoverStuckAgent(agent);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await log('🔍 OpenClaw Recovery Agent started');
  await log(`   Gateway URL: ${GATEWAY_URL}`);
  await log(`   Anthropic API: ${ANTHROPIC_API_KEY ? 'configured ✓' : 'not set — smart diagnostics disabled'}`);
  await log(`   Slack: ${SLACK_BOT_TOKEN ? 'configured ✓' : 'not set — notifications disabled'}`);
  await log(`   Monitoring ${AGENTS.length} agents`);
  await log('');

  await notifySlack('Recovery Agent started. Monitoring gateway and all agents.');

  // Initial gateway check
  const healthy = await checkGateway();
  await log(`Initial gateway status: ${healthy ? 'healthy' : 'DOWN'}`);

  // Gateway health loop
  setInterval(gatewayLoop, GATEWAY_CHECK_INTERVAL);

  // Agent health loop
  setInterval(agentLoop, AGENT_CHECK_INTERVAL);
}

main().catch(async (err) => {
  await log(`FATAL: ${err.message}`);
  process.exit(1);
});

# OpenClaw Dashboard

A real-time monitoring dashboard for OpenClaw AI agents, featuring an animated pixel-art virtual office where you can watch your agents work, chat, and take breaks.

## Features

### Virtual Office
- **Individual offices** — Each of the 16 agents has their own room with a unique accent color, desk, window, and decorations
- **Break room** — Idle agents walk to a shared break room with couches, coffee machine, and vending machine
- **Agent-to-agent chat** — When agents collaborate (same active state), one walks to the other's office and they exchange speech bubbles
- **Thought bubbles** — Active agents show thought bubbles from their monitor displaying their current task
- **Slack visitors** — Users chatting with agents via Slack/webchat appear as visitor characters that walk to the agent's office (with Slack avatar support)
- **Pan & zoom** — Click-drag to pan, scroll to zoom, double-click to reset

### Dashboard Pages
- **Virtual Office** (`/`) — Pixel-art office visualization + agent cards + activity feed
- **Agent Roster** (`/agents`) — Searchable grid of all agents with sparklines, expandable details, and focus button
- **Session Logs** (`/sessions`) — Table of recent conversations with channel badges and token usage
- **System Metrics** (`/stats`) — Token usage bar chart, 7-day trend line, agent state donut chart

### UI
- Dark glassmorphism theme with animated background
- Mobile-responsive sidebar with hamburger menu
- Page transition animations
- Skeleton loading states
- Real-time activity feed

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## How It Works

The dashboard reads agent state from the OpenClaw workspace:

- **Agent state** — `~/.openclaw/workspace-{label}/star_state.json` (polled every 5s)
- **Sessions** — `~/.openclaw/agents/{name}/sessions/*.jsonl`
- **Gateway health** — `http://127.0.0.1:18789/health` (polled every 15s)

### Agent States
| State | Color | Office Behavior |
|-------|-------|-----------------|
| `idle` | Gray | Walks to break room |
| `writing` | Blue | At desk, thought bubble |
| `researching` | Purple | At desk, thought bubble |
| `executing` | Amber | At desk, thought bubble |
| `syncing` | Cyan | At desk, may chat with other syncing agents |
| `error` | Red | At desk, red floor glow, jump animation |

## Tech Stack

- **Next.js 14** (App Router)
- **React 18**
- **Tailwind CSS 4**
- **Recharts** — Charts and sparklines
- **date-fns** — Time formatting
- **HTML Canvas** — Pixel office rendering

## Agents

16 pre-configured agents: Smith, Penny, Desk, Hex, Janet, Pipeline, Reef, Quill, Scout, Axel, Hal, Grace, Lex, Ada, Ivy, Tess.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/agents` | All agent states |
| `GET /api/agents/[label]` | Per-agent detail with token history |
| `GET /api/sessions` | Recent session logs |
| `GET /api/stats` | Token usage stats, time series, state distribution |
| `GET /api/health` | Gateway health check |
| `GET /api/conversations` | Simulated agent-to-agent conversations |
| `GET /api/visitors` | Active Slack/webchat visitors |
| `GET /api/activity` | Recent activity events |

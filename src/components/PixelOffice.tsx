'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { AgentState, STATE_COLORS, hashStr } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';

// ─── Layout Constants ────────────────────────────────────────────────────────
const ROOM_W = 220, ROOM_H = 200;
const CORRIDOR = 40;
const COLS = 5, ROWS = 4;
const GRID_W = COLS * ROOM_W + (COLS - 1) * CORRIDOR;  // 1000
const GRID_H = ROWS * ROOM_H + (ROWS - 1) * CORRIDOR;  // 920

// Break room on the right side of the grid
const BREAK_ROOM_W = 260;
const BREAK_ROOM_X = GRID_W + CORRIDOR; // corridor gap then break room
const W = BREAK_ROOM_X + BREAK_ROOM_W;
const H = GRID_H;

const ACTIVE_STATES = new Set(['writing', 'researching', 'executing', 'syncing']);

// Break room seating positions (agents lounge here when idle)
const BREAK_ROOM_SEATS = [
  { x: BREAK_ROOM_X + 50, y: 80 },
  { x: BREAK_ROOM_X + 130, y: 100 },
  { x: BREAK_ROOM_X + 200, y: 75 },
  { x: BREAK_ROOM_X + 60, y: 180 },
  { x: BREAK_ROOM_X + 140, y: 200 },
  { x: BREAK_ROOM_X + 210, y: 175 },
  { x: BREAK_ROOM_X + 50, y: 300 },
  { x: BREAK_ROOM_X + 130, y: 320 },
  { x: BREAK_ROOM_X + 200, y: 295 },
  { x: BREAK_ROOM_X + 60, y: 420 },
  { x: BREAK_ROOM_X + 140, y: 440 },
  { x: BREAK_ROOM_X + 210, y: 415 },
  { x: BREAK_ROOM_X + 50, y: 540 },
  { x: BREAK_ROOM_X + 130, y: 560 },
  { x: BREAK_ROOM_X + 200, y: 535 },
  { x: BREAK_ROOM_X + 130, y: 680 },
  { x: BREAK_ROOM_X + 80, y: 750 },
  { x: BREAK_ROOM_X + 170, y: 770 },
  { x: BREAK_ROOM_X + 60, y: 830 },
  { x: BREAK_ROOM_X + 190, y: 850 },
];

// Agent color palettes derived from name hash
const SHIRT_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#9b59b6','#e67e22',
  '#1abc9c','#e84393','#0984e3','#6c5ce7','#00b894',
  '#fdcb6e','#fab1a0','#74b9ff','#a29bfe','#ff7675','#55efc4'
];
const HAIR_COLORS = ['#2c1810','#8B4513','#DAA520','#1a1a2e','#C0392B','#5D4037','#212121','#D4A574'];
const HAIR_STYLES = [0,1,2,3];

// Decoration types that can be assigned to rooms
const DECORATION_TYPES = ['plant','bookshelf','lamp','coffeeMachine','serverRack','framedPicture','clock','whiteboard'] as const;
type DecorationType = typeof DECORATION_TYPES[number];

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}


// ─── Room geometry helpers ──────────────────────────────────────────────────
function getRoomOrigin(index: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: col * (ROOM_W + CORRIDOR),
    y: row * (ROOM_H + CORRIDOR),
  };
}

function getDeskPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + 90, y: o.y + 80 };
}

function getChairPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + 95, y: o.y + 105 };
}

function getMonitorPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + 104, y: o.y + 71 };
}

// Door position — 0.5 units INTO the corridor so agents clear the doorframe
function getDoorPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + ROOM_W / 2, y: o.y + ROOM_H + 8 };
}

// Interior door — just inside the room near the door
function getInsideDoorPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + ROOM_W / 2, y: o.y + ROOM_H - 8 };
}

// ─── Corridor center coordinate helpers ──────────────────────────────────────
function hCorridorY(row: number): number {
  return (row + 1) * ROOM_H + row * CORRIDOR + CORRIDOR / 2;
}
function vCorridorX(col: number): number {
  return (col + 1) * ROOM_W + col * CORRIDOR + CORRIDOR / 2;
}

// ─── A* Navigation Graph ─────────────────────────────────────────────────────
// Build a graph of walkable nodes: door positions, corridor intersections,
// and break room entry. A* finds the shortest path between any two nodes.

interface NavNode {
  id: string;
  x: number;
  y: number;
  neighbors: string[]; // ids of connected nodes
}

const navGraph = new Map<string, NavNode>();

function nid(x: number, y: number): string {
  return `${Math.round(x)},${Math.round(y)}`;
}

function buildNavGraph() {
  navGraph.clear();

  const ensure = (x: number, y: number): string => {
    const id = nid(x, y);
    if (!navGraph.has(id)) navGraph.set(id, { id, x, y, neighbors: [] });
    return id;
  };
  const connect = (a: string, b: string) => {
    if (a === b) return;
    const na = navGraph.get(a), nb = navGraph.get(b);
    if (!na || !nb) return;
    if (!na.neighbors.includes(b)) na.neighbors.push(b);
    if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
  };

  // 1. Room nodes: chair <-> insideDoor <-> door(corridor)
  for (let i = 0; i < COLS * ROWS; i++) {
    const c = getChairPos(i);
    const id = getInsideDoorPos(i);
    const d = getDoorPos(i);
    const chairId = ensure(c.x, c.y);
    const insideId = ensure(id.x, id.y);
    const doorId = ensure(d.x, d.y);
    connect(chairId, insideId);
    connect(insideId, doorId);
  }

  // 2. Horizontal corridors
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = hCorridorY(row);
    const nodesOnCorridor: string[] = [];

    for (let col = 0; col < COLS; col++) {
      // Room above — project door onto corridor
      const roomAbove = row * COLS + col;
      const doorAbove = getDoorPos(roomAbove);
      const projId = ensure(doorAbove.x, cy);
      nodesOnCorridor.push(projId);
      connect(nid(doorAbove.x, doorAbove.y), projId);

      // Room below — connect its door to this corridor too
      const roomBelow = (row + 1) * COLS + col;
      const doorBelow = getDoorPos(roomBelow);
      const projBelowId = ensure(doorBelow.x, cy);
      if (!nodesOnCorridor.includes(projBelowId)) nodesOnCorridor.push(projBelowId);
      // Connect via intermediate node at top of room below
      const topOfBelow = Math.floor(roomBelow / COLS) * (ROOM_H + CORRIDOR);
      const topId = ensure(doorBelow.x, topOfBelow);
      connect(projBelowId, topId);
      connect(topId, nid(doorBelow.x, doorBelow.y));
    }

    // V-corridor intersections
    for (let col = 0; col < COLS - 1; col++) {
      nodesOnCorridor.push(ensure(vCorridorX(col), cy));
    }

    // Break room corridor extension
    const breakExtId = ensure(BREAK_ROOM_X, cy);
    nodesOnCorridor.push(breakExtId);

    // Sort by X and connect adjacent
    const unique = Array.from(new Set(nodesOnCorridor));
    const sorted = unique.map(id => navGraph.get(id)!).filter(Boolean).sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length - 1; i++) {
      connect(sorted[i].id, sorted[i + 1].id);
    }
  }

  // 3. Vertical corridors
  for (let col = 0; col < COLS - 1; col++) {
    const cx = vCorridorX(col);
    for (let row = 0; row < ROWS - 2; row++) {
      connect(nid(cx, hCorridorY(row)), nid(cx, hCorridorY(row + 1)));
    }
  }

  // 4. Break room corridor vertical
  for (let row = 0; row < ROWS - 2; row++) {
    connect(nid(BREAK_ROOM_X, hCorridorY(row)), nid(BREAK_ROOM_X, hCorridorY(row + 1)));
  }

  // 5. Break room interior nodes
  const breakEntryId = ensure(BREAK_ROOM_X + 40, GRID_H / 2);
  for (let row = 0; row < ROWS - 1; row++) {
    connect(nid(BREAK_ROOM_X, hCorridorY(row)), breakEntryId);
  }
  for (let bx = 1; bx <= 3; bx++) {
    for (let by = 0; by < 3; by++) {
      const nodeX = BREAK_ROOM_X + bx * 60;
      const nodeY = 40 + by * (GRID_H / 3);
      const id = ensure(nodeX, nodeY);
      connect(id, breakEntryId);
      if (bx > 1) connect(id, nid(BREAK_ROOM_X + (bx - 1) * 60, nodeY));
      if (by > 0) connect(id, nid(nodeX, 40 + (by - 1) * (GRID_H / 3)));
    }
  }

  // 6. Additional corridor connections for bottom-row rooms
  // Bottom row rooms connect to the last corridor above them
  if (ROWS > 1) {
    const lastCY = hCorridorY(ROWS - 2);
    for (let col = 0; col < COLS; col++) {
      const room = (ROWS - 1) * COLS + col;
      const door = getDoorPos(room);
      const projId = ensure(door.x, lastCY);
      connect(nid(door.x, door.y), projId);
    }
  }
}

// Build on module load
buildNavGraph();

// ─── A* pathfinding ──────────────────────────────────────────────────────────
function aStar(startX: number, startY: number, endX: number, endY: number): { x: number; y: number }[] {
  // Find closest nav nodes to start and end
  let bestStartId = '', bestStartDist = Infinity;
  let bestEndId = '', bestEndDist = Infinity;

  navGraph.forEach((node, id) => {
    const ds = Math.hypot(node.x - startX, node.y - startY);
    const de = Math.hypot(node.x - endX, node.y - endY);
    if (ds < bestStartDist) { bestStartDist = ds; bestStartId = id; }
    if (de < bestEndDist) { bestEndDist = de; bestEndId = id; }
  });

  if (!bestStartId || !bestEndId) return [];
  if (bestStartId === bestEndId) return [{ x: endX, y: endY }];

  const openList = [bestStartId];
  const closedSet: Record<string, boolean> = {};
  const cameFrom: Record<string, string> = {};
  const gScore: Record<string, number> = {};
  const fScore: Record<string, number> = {};

  gScore[bestStartId] = 0;
  const endNode = navGraph.get(bestEndId)!;
  fScore[bestStartId] = Math.hypot(navGraph.get(bestStartId)!.x - endNode.x, navGraph.get(bestStartId)!.y - endNode.y);

  while (openList.length > 0) {
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if ((fScore[openList[i]] ?? Infinity) < (fScore[openList[bestIdx]] ?? Infinity)) {
        bestIdx = i;
      }
    }
    const current = openList[bestIdx];

    if (current === bestEndId) {
      const path: { x: number; y: number }[] = [];
      let c = current;
      while (cameFrom[c]) {
        const node = navGraph.get(c)!;
        path.unshift({ x: node.x, y: node.y });
        c = cameFrom[c];
      }
      path.push({ x: endX, y: endY });
      return path;
    }

    openList.splice(bestIdx, 1);
    closedSet[current] = true;
    const currentNode = navGraph.get(current)!;
    const currentG = gScore[current] ?? Infinity;

    for (let n = 0; n < currentNode.neighbors.length; n++) {
      const neighborId = currentNode.neighbors[n];
      if (closedSet[neighborId]) continue;
      const neighbor = navGraph.get(neighborId)!;
      const tentativeG = currentG + Math.hypot(neighbor.x - currentNode.x, neighbor.y - currentNode.y);

      if (tentativeG < (gScore[neighborId] ?? Infinity)) {
        cameFrom[neighborId] = current;
        gScore[neighborId] = tentativeG;
        fScore[neighborId] = tentativeG + Math.hypot(neighbor.x - endNode.x, neighbor.y - endNode.y);
        if (openList.indexOf(neighborId) === -1) {
          openList.push(neighborId);
        }
      }
    }
  }

  // No path found — return empty (caller handles with pathTo)
  return [];
}

// ─── Safe pathfinding wrapper — never walks through walls ────────────────────
function pathTo(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
  const path = aStar(fromX, fromY, toX, toY);
  const dest = { x: toX, y: toY };
  if (path.length === 0) {
    // No A* path — find nearest graph node as intermediate
    let bestNode: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    navGraph.forEach((node) => {
      const d = Math.hypot(node.x - toX, node.y - toY);
      if (d < bestDist) { bestDist = d; bestNode = { x: node.x, y: node.y }; }
    });
    if (bestNode) return [bestNode, dest];
    return [dest];
  }
  // Always append exact destination
  path.push(dest);
  return path;
}

function setWaypoints(entity: { waypoints: {x:number;y:number}[]; waypointIndex: number; targetX: number; targetY: number; isWalking: boolean }, wp: {x:number;y:number}[]) {
  entity.waypoints = wp;
  entity.waypointIndex = 0;
  if (wp.length > 0) {
    entity.targetX = wp[0].x;
    entity.targetY = wp[0].y;
    entity.isWalking = true;
  }
}

function getCorridorWaypoints(fromRoom: number, toRoom: number): { x: number; y: number }[] {
  const fromChair = getChairPos(fromRoom);
  const toChair = getChairPos(toRoom);
  return pathTo(fromChair.x, fromChair.y, toChair.x, toChair.y);
}

function getRoomDecorations(label: string): [DecorationType, DecorationType] {
  const h = hashStr(label);
  const d1 = DECORATION_TYPES[h % DECORATION_TYPES.length];
  const d2 = DECORATION_TYPES[(h >> 4) % DECORATION_TYPES.length];
  return d1 === d2
    ? [d1, DECORATION_TYPES[(h >> 8) % DECORATION_TYPES.length]]
    : [d1, d2];
}

// ─── Drawing helpers (flat vector style) ─────────────────────────────────────
const FONT = 'system-ui, -apple-system, sans-serif';

function drawCleanText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 10) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function setShadow(ctx: CanvasRenderingContext2D, blur: number, offsetX = 0, offsetY = 2, color = 'rgba(0,0,0,0.12)') {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = offsetX;
  ctx.shadowOffsetY = offsetY;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// ─── Furniture drawing (flat vector) ─────────────────────────────────────────

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, glowColor?: string) {
  // Desk surface
  setShadow(ctx, 4, 0, 2);
  roundRect(ctx, x, y + 10, 40, 6, 3, '#A1887F');
  clearShadow(ctx);
  roundRect(ctx, x + 1, y + 11, 38, 4, 2, '#BCAAA4');
  // Desk legs
  roundRect(ctx, x + 3, y + 16, 3, 6, 1, '#8D6E63');
  roundRect(ctx, x + 34, y + 16, 3, 6, 1, '#8D6E63');
  // Monitor
  setShadow(ctx, 3, 0, 1);
  roundRect(ctx, x + 12, y, 16, 11, 2, '#455A64');
  clearShadow(ctx);
  roundRect(ctx, x + 13, y + 1, 14, 9, 1.5, glowColor || '#37474F');
  // Monitor stand
  roundRect(ctx, x + 18, y + 11, 4, 2, 1, '#607D8B');
  // Keyboard
  roundRect(ctx, x + 10, y + 12, 14, 3, 1.5, '#B0BEC5');
  // Screen glow
  if (glowColor && glowColor !== '#37474F') {
    ctx.fillStyle = hexToRgba(glowColor, 0.06);
    ctx.beginPath();
    ctx.roundRect(x + 6, y - 3, 28, 20, 4);
    ctx.fill();
  }
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Seat
  roundRect(ctx, x, y, 12, 5, 3, '#546E7A');
  // Back
  roundRect(ctx, x + 1, y - 8, 10, 9, 3, '#455A64');
  // Legs
  roundRect(ctx, x + 2, y + 5, 2, 4, 1, '#78909C');
  roundRect(ctx, x + 8, y + 5, 2, 4, 1, '#78909C');
  // Wheels
  ctx.fillStyle = '#90A4AE';
  ctx.beginPath(); ctx.arc(x + 3, y + 9, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 9, y + 9, 1.5, 0, Math.PI * 2); ctx.fill();
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pot
  roundRect(ctx, x, y + 6, 8, 6, 2, '#D84315');
  roundRect(ctx, x - 1, y + 5, 10, 2, 1, '#BF360C');
  // Stem
  roundRect(ctx, x + 3, y + 2, 2, 4, 1, '#4CAF50');
  // Foliage (circles)
  ctx.fillStyle = '#43A047';
  ctx.beginPath(); ctx.arc(x + 4, y + 1, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#66BB6A';
  ctx.beginPath(); ctx.arc(x + 1, y + 2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#388E3C';
  ctx.beginPath(); ctx.arc(x + 6, y + 2, 3, 0, Math.PI * 2); ctx.fill();
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  // Stand
  roundRect(ctx, x + 3, y + 2, 2, 18, 1, '#9E9E9E');
  // Shade (triangle-ish shape)
  ctx.fillStyle = on ? '#FFF59D' : '#BDBDBD';
  ctx.beginPath();
  ctx.moveTo(x - 2, y);
  ctx.lineTo(x + 10, y);
  ctx.lineTo(x + 7, y - 6);
  ctx.lineTo(x + 1, y - 6);
  ctx.closePath();
  ctx.fill();
  // Light glow
  if (on) {
    ctx.fillStyle = 'rgba(255,245,157,0.06)';
    ctx.beginPath();
    ctx.arc(x + 4, y + 10, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  setShadow(ctx, 3, 0, 2);
  roundRect(ctx, x, y, 24, 30, 3, '#546E7A');
  clearShadow(ctx);
  roundRect(ctx, x + 2, y + 2, 20, 10, 2, '#37474F');
  // Buttons
  ctx.fillStyle = '#4CAF50';
  ctx.beginPath(); ctx.arc(x + 7, y + 16, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#F44336';
  ctx.beginPath(); ctx.arc(x + 13, y + 16, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFC107';
  ctx.beginPath(); ctx.arc(x + 19, y + 16, 2, 0, Math.PI * 2); ctx.fill();
  // Cup area
  roundRect(ctx, x + 6, y + 20, 12, 8, 2, '#37474F');
  roundRect(ctx, x + 8, y + 22, 8, 5, 1.5, '#ECEFF1');
  // Steam
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const phase of [0, 2.1, 4.2]) {
    const t = (time * 0.002 + phase) % 3;
    if (t < 2) {
      const sy = y - 2 - t * 6;
      const sx = x + 11 + Math.sin(t * 3 + phase) * 2;
      ctx.globalAlpha = 0.3 * (1 - t / 2);
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  setShadow(ctx, 3, 0, 2);
  roundRect(ctx, x, y, 40, 50, 3, '#5D4037');
  clearShadow(ctx);
  roundRect(ctx, x + 2, y + 2, 36, 46, 2, '#6D4C41');
  const bookColors = ['#C62828','#1565C0','#2E7D32','#F9A825','#6A1B9A','#00838F','#EF6C00','#AD1457'];
  for (let s = 0; s < 3; s++) {
    const sy = y + 4 + s * 15;
    roundRect(ctx, x + 2, sy + 12, 36, 2, 1, '#3E2723');
    let bx = x + 3;
    for (let b = 0; b < 6; b++) {
      const bw = 3 + (s * 3 + b) % 3;
      const bh = 10 + (b % 2);
      const bc = bookColors[(s * 6 + b) % bookColors.length];
      roundRect(ctx, bx, sy + 12 - bh, bw, bh, 1, bc);
      bx += bw + 1;
    }
  }
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  setShadow(ctx, 3, 0, 2);
  roundRect(ctx, x, y, 30, 50, 3, '#37474F');
  clearShadow(ctx);
  roundRect(ctx, x + 1, y + 1, 28, 48, 2, '#455A64');
  for (let u = 0; u < 5; u++) {
    const uy = y + 3 + u * 9;
    roundRect(ctx, x + 3, uy, 24, 7, 2, '#263238');
  }
  // LEDs
  const ledColors = ['#4CAF50', '#F44336', '#2196F3', '#FFC107'];
  for (let i = 0; i < 6; i++) {
    const lx = x + 6 + (i % 3) * 4;
    const ly = y + 6 + Math.floor(i / 3) * 9;
    const phase = i * 1.7;
    const on = Math.sin(time * 0.003 * (0.5 + (i % 3) * 0.5) + phase) > 0;
    const c = on ? ledColors[i % ledColors.length] : '#1a1a1a';
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(lx, ly, 1.5, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      ctx.fillStyle = hexToRgba(ledColors[i % ledColors.length], 0.2);
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFramedPicture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  setShadow(ctx, 3, 0, 1);
  roundRect(ctx, x, y, 30, 24, 2, '#6D4C41');
  clearShadow(ctx);
  roundRect(ctx, x + 2, y + 2, 26, 20, 1, '#E8D5B7');
  // Sky
  roundRect(ctx, x + 2, y + 2, 26, 10, 0, '#87CEEB');
  // Hills
  roundRect(ctx, x + 2, y + 12, 26, 10, 0, '#81C784');
  // Sun
  ctx.fillStyle = '#FFD54F';
  ctx.beginPath(); ctx.arc(x + 22, y + 7, 3, 0, Math.PI * 2); ctx.fill();
}

function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, _time: number) {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();

  setShadow(ctx, 3, 0, 1);
  ctx.fillStyle = '#FFFDE7';
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
  clearShadow(ctx);
  // Frame
  ctx.strokeStyle = '#8D6E63';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
  // Hour marks
  for (let h = 0; h < 12; h++) {
    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = '#8D6E63';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(angle) * 8, cy + Math.sin(angle) * 8, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hour hand
  const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(hAngle) * 5, cy + Math.sin(hAngle) * 5);
  ctx.stroke();
  // Minute hand
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(mAngle) * 7, cy + Math.sin(mAngle) * 7);
  ctx.stroke();
  // Center dot
  ctx.fillStyle = '#C62828';
  ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill();
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number) {
  setShadow(ctx, 3, 0, 1);
  roundRect(ctx, x, y, 50, 32, 3, '#E0E0E0');
  clearShadow(ctx);
  roundRect(ctx, x + 2, y + 2, 46, 28, 2, '#FAFAFA');
  // Lines of text
  for (let i = 0; i < 4; i++) {
    const sy = y + 7 + i * 6;
    const sw = 20 + (i * 7) % 15;
    roundRect(ctx, x + 6, sy, sw, 2, 1, '#90CAF9');
  }
  // Red dot
  ctx.fillStyle = '#E53935';
  ctx.beginPath(); ctx.arc(x + 40, y + 10, 2, 0, Math.PI * 2); ctx.fill();
  // Tray
  roundRect(ctx, x + 5, y + 32, 40, 3, 1, '#BDBDBD');
  // Markers
  roundRect(ctx, x + 10, y + 31, 5, 2, 1, '#F44336');
  roundRect(ctx, x + 17, y + 31, 5, 2, 1, '#2196F3');
}

// Draw a decoration in a room at a given position
function drawDecoration(ctx: CanvasRenderingContext2D, type: DecorationType, x: number, y: number, time: number) {
  switch (type) {
    case 'plant': drawPlant(ctx, x, y); break;
    case 'bookshelf': drawBookshelf(ctx, x, y - 20); break;
    case 'lamp': drawLamp(ctx, x, y - 10, true); break;
    case 'coffeeMachine': drawCoffeeMachine(ctx, x, y - 10, time); break;
    case 'serverRack': drawServerRack(ctx, x, y - 20, time); break;
    case 'framedPicture': drawFramedPicture(ctx, x, y); break;
    case 'clock': drawClock(ctx, x + 10, y + 10, time); break;
    case 'whiteboard': drawWhiteboard(ctx, x, y); break;
  }
}

// ─── Room drawing (flat vector) ─────────────────────────────────────────────
// Accent wall colors per room — muted modern palette
const ACCENT_WALLS = [
  '#5B7FA5','#7B6B8D','#6B8E6B','#B0785A','#5A8A8A','#8B6B6B','#6B7B8B','#8A7B5A',
  '#6B8B7B','#7B6B7B','#5B8B6B','#8B7B6B','#6B6B8B','#7B8B5B','#8B5B6B','#5B7B8B',
  '#7B8B6B','#6B5B8B','#8B6B7B','#5B8B8B',
];

function drawRoom(ctx: CanvasRenderingContext2D, roomIndex: number, label: string, name: string, emoji: string, glowColor: string | undefined, isError: boolean, time: number) {
  const o = getRoomOrigin(roomIndex);
  const accent = ACCENT_WALLS[roomIndex % ACCENT_WALLS.length];

  // Room with drop shadow
  setShadow(ctx, 8, 0, 3, 'rgba(0,0,0,0.08)');
  roundRect(ctx, o.x, o.y, ROOM_W, ROOM_H, 6, '#F5F0E8');
  clearShadow(ctx);

  // Error red floor glow
  if (isError) {
    const pulse = 0.06 + Math.sin(time * 0.002) * 0.03;
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.beginPath();
    ctx.roundRect(o.x + 2, o.y + 2, ROOM_W - 4, ROOM_H - 4, 5);
    ctx.fill();
  }

  // Accent stripe along back wall (4px colored bar)
  roundRect(ctx, o.x + 4, o.y + 4, ROOM_W - 8, 4, 2, accent);

  // Window on back wall — simple light blue rounded rect
  const winW = 44, winH = 20;
  const winX = o.x + ROOM_W - 65, winY = o.y + 14;
  setShadow(ctx, 2, 0, 1, 'rgba(0,0,0,0.06)');
  roundRect(ctx, winX, winY, winW, winH, 3, '#B3E5FC');
  clearShadow(ctx);
  // Window frame
  ctx.strokeStyle = '#90CAF9';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, 3);
  ctx.stroke();
  // Window divider
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.stroke();

  // Clean thin walls (1px lines, light gray)
  ctx.strokeStyle = '#D5CEC6';
  ctx.lineWidth = 1;
  // Left wall
  ctx.beginPath();
  ctx.moveTo(o.x + 0.5, o.y);
  ctx.lineTo(o.x + 0.5, o.y + ROOM_H);
  ctx.stroke();
  // Right wall
  ctx.beginPath();
  ctx.moveTo(o.x + ROOM_W - 0.5, o.y);
  ctx.lineTo(o.x + ROOM_W - 0.5, o.y + ROOM_H);
  ctx.stroke();
  // Top wall
  ctx.beginPath();
  ctx.moveTo(o.x, o.y + 0.5);
  ctx.lineTo(o.x + ROOM_W, o.y + 0.5);
  ctx.stroke();

  // Bottom wall with door gap
  const doorW = 36;
  const doorX = o.x + ROOM_W / 2 - doorW / 2;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y + ROOM_H - 0.5);
  ctx.lineTo(doorX, o.y + ROOM_H - 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(doorX + doorW, o.y + ROOM_H - 0.5);
  ctx.lineTo(o.x + ROOM_W, o.y + ROOM_H - 0.5);
  ctx.stroke();

  // Nameplate — clean sans-serif, left-aligned
  const plateTxt = `${emoji} ${name}`;
  ctx.font = `bold 10px ${FONT}`;
  const tw = ctx.measureText(plateTxt).width;
  const plateX = o.x + 14;
  setShadow(ctx, 2, 0, 1, 'rgba(0,0,0,0.05)');
  roundRect(ctx, plateX, o.y + 14, tw + 12, 16, 4, 'rgba(255,255,255,0.85)');
  clearShadow(ctx);
  ctx.fillStyle = '#4A4A4A';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateTxt, plateX + 6, o.y + 22);

  // Desk + chair
  const deskPos = getDeskPos(roomIndex);
  drawDesk(ctx, deskPos.x - 10, deskPos.y - 30, glowColor);
  const chairPos = getChairPos(roomIndex);
  drawChair(ctx, chairPos.x - 6, chairPos.y - 12);

  // Decorations
  const [dec1, dec2] = getRoomDecorations(label);
  drawDecoration(ctx, dec1, o.x + 15, o.y + 130, time);
  drawDecoration(ctx, dec2, o.x + ROOM_W - 55, o.y + 50, time);
}

// ─── Break Room (flat vector) ────────────────────────────────────────────────

function drawCouch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  setShadow(ctx, 4, 0, 2);
  roundRect(ctx, x, y, 80, 24, 6, '#7B1FA2');
  clearShadow(ctx);
  roundRect(ctx, x, y, 80, 10, 5, '#6A1B9A');
  for (let i = 0; i < 3; i++) {
    roundRect(ctx, x + 3 + i * 26, y + 10, 22, 12, 3, '#9C27B0');
  }
  roundRect(ctx, x - 3, y + 4, 5, 18, 3, '#6A1B9A');
  roundRect(ctx, x + 78, y + 4, 5, 18, 3, '#6A1B9A');
}

function getBreakRoomSeat(agentIndex: number): { x: number; y: number } {
  return BREAK_ROOM_SEATS[agentIndex % BREAK_ROOM_SEATS.length];
}

function getBreakRoomWaypoints(fromRoom: number, seatPos: { x: number; y: number }): { x: number; y: number }[] {
  const chair = getChairPos(fromRoom);
  return pathTo(chair.x, chair.y, seatPos.x, seatPos.y);
}

function getReturnFromBreakWaypoints(toRoom: number, currentX: number, currentY: number): { x: number; y: number }[] {
  const chair = getChairPos(toRoom);
  return pathTo(currentX, currentY, chair.x, chair.y);
}

function drawBreakRoom(ctx: CanvasRenderingContext2D, time: number) {
  const bx = BREAK_ROOM_X, by = 0;

  // Floor — soft warm fill
  setShadow(ctx, 8, 0, 3, 'rgba(0,0,0,0.06)');
  roundRect(ctx, bx, by, BREAK_ROOM_W, H, 6, '#EDE7DD');
  clearShadow(ctx);

  // Left divider line
  ctx.strokeStyle = '#D5CEC6';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx - 0.5, 0);
  ctx.lineTo(bx - 0.5, H);
  ctx.stroke();

  // "Break Room" label — clean sans-serif
  ctx.font = `bold 12px ${FONT}`;
  setShadow(ctx, 2, 0, 1, 'rgba(0,0,0,0.05)');
  roundRect(ctx, bx + 10, 12, 120, 20, 6, 'rgba(255,255,255,0.85)');
  clearShadow(ctx);
  ctx.fillStyle = '#5D4037';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Break Room', bx + 18, 22);

  // Couch (top area)
  drawCouch(ctx, bx + 20, 60);

  // Coffee table — small brown rounded rect
  const ctX = bx + 90, ctY = 130;
  setShadow(ctx, 3, 0, 1);
  roundRect(ctx, ctX, ctY, 46, 6, 3, '#8D6E63');
  clearShadow(ctx);
  roundRect(ctx, ctX + 1, ctY + 1, 44, 4, 2, '#A1887F');
  // Coffee cups
  roundRect(ctx, ctX + 10, ctY - 3, 5, 4, 1.5, '#ECEFF1');
  roundRect(ctx, ctX + 30, ctY - 3, 5, 4, 1.5, '#ECEFF1');

  // Accent rug (middle area)
  const rugX = bx + 30, rugY = 250;
  roundRect(ctx, rugX, rugY, 200, 100, 8, '#9C27B0');
  roundRect(ctx, rugX + 4, rugY + 4, 192, 92, 6, '#AB47BC');
  // Simple dot pattern
  ctx.fillStyle = '#CE93D8';
  for (let i = 0; i < 5; i++) {
    const dx = rugX + 25 + i * 38;
    const dy = rugY + 48;
    ctx.beginPath();
    ctx.arc(dx, dy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Couch (lower area)
  drawCouch(ctx, bx + 20, 380);

  // Coffee machine
  drawCoffeeMachine(ctx, bx + 30, 500, time);

  // Vending machine
  const vmX = bx + 80, vmY = 500;
  setShadow(ctx, 4, 0, 2);
  roundRect(ctx, vmX, vmY, 30, 40, 4, '#1976D2');
  clearShadow(ctx);
  roundRect(ctx, vmX + 2, vmY + 2, 26, 22, 3, '#0D47A1');
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const color = ['#F44336', '#FFC107', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#8BC34A'][(r * 3 + c) % 9];
      roundRect(ctx, vmX + 5 + c * 7, vmY + 5 + r * 6, 5, 4, 1.5, color);
    }
  }
  roundRect(ctx, vmX + 2, vmY + 26, 26, 12, 2, '#0D47A1');

  // Plants
  drawPlant(ctx, bx + 15, 160);
  drawPlant(ctx, bx + BREAK_ROOM_W - 25, 160);
  drawPlant(ctx, bx + 15, 460);
  drawPlant(ctx, bx + BREAK_ROOM_W - 25, 600);

  // Potted tree
  const ptX = bx + BREAK_ROOM_W - 50, ptY = 50;
  roundRect(ctx, ptX, ptY + 16, 12, 10, 3, '#D84315');
  roundRect(ctx, ptX - 1, ptY + 15, 14, 2, 1, '#BF360C');
  roundRect(ctx, ptX + 3, ptY + 8, 6, 8, 2, '#4CAF50');
  ctx.fillStyle = '#388E3C';
  ctx.beginPath(); ctx.arc(ptX + 6, ptY + 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#43A047';
  ctx.beginPath(); ctx.arc(ptX + 1, ptY + 6, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ptX + 10, ptY + 5, 4, 0, Math.PI * 2); ctx.fill();

  // Wall art — simple framed rectangles
  const posterX = bx + 100, posterY = 10;
  setShadow(ctx, 2, 0, 1);
  roundRect(ctx, posterX, posterY, 30, 22, 3, '#37474F');
  clearShadow(ctx);
  roundRect(ctx, posterX + 2, posterY + 2, 26, 18, 2, '#263238');
  ctx.fillStyle = '#7C4DFF';
  ctx.font = `bold 8px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RELAX', posterX + 15, posterY + 11);

  const p2X = bx + 160, p2Y = 470;
  setShadow(ctx, 2, 0, 1);
  roundRect(ctx, p2X, p2Y, 30, 22, 3, '#37474F');
  clearShadow(ctx);
  roundRect(ctx, p2X + 2, p2Y + 2, 26, 18, 2, '#263238');
  ctx.fillStyle = '#00BCD4';
  ctx.font = `bold 8px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CHILL', p2X + 15, p2Y + 11);
}

// ─── Corridor drawing (flat vector) ─────────────────────────────────────────

function drawCorridorFill(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number) {
  // Solid light gray fill — no tiles or checkerboard
  ctx.fillStyle = '#E0DAD2';
  ctx.fillRect(rx, ry, rw, rh);
  // Subtle 1px border
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
}

function drawCorridors(ctx: CanvasRenderingContext2D) {
  // Horizontal corridors (extend to break room)
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = (row + 1) * ROOM_H + row * CORRIDOR;
    drawCorridorFill(ctx, 0, cy, BREAK_ROOM_X, CORRIDOR);
  }
  // Vertical corridors between office columns
  for (let col = 0; col < COLS - 1; col++) {
    const cx = (col + 1) * ROOM_W + col * CORRIDOR;
    drawCorridorFill(ctx, cx, 0, CORRIDOR, GRID_H);
  }
  // Break room corridor (vertical, right of grid)
  drawCorridorFill(ctx, GRID_W, 0, CORRIDOR, H);
}

// ─── Character drawing (flat vector) ─────────────────────────────────────────
interface AgentAnim {
  label: string; name: string; emoji: string; state: string; detail: string;
  x: number; y: number; targetX: number; targetY: number;
  shirtColor: string; hairColor: string; hairStyle: number;
  walkFrame: number; walkTimer: number; isWalking: boolean;
  bobOffset: number; bobTimer: number;
  errorTimer: number;
  hovered: boolean;
  roomIndex: number;
  // Chat state machine
  chatState: 'at_desk' | 'walking_to_chat' | 'chatting' | 'walking_home' | 'walking_to_break' | 'in_break_room' | 'walking_from_break';
  chatTarget: number; // room index of chat partner
  waypoints: { x: number; y: number }[];
  waypointIndex: number;
  chatMessageIndex: number;
  chatTimer: number;
  conversationId: string | null;
}

// ─── Visitor (Slack/webchat user) animation state ────────────────────────────
interface VisitorAnim {
  id: string; name: string; surface: string;
  x: number; y: number; targetX: number; targetY: number;
  shirtColor: string; skinColor: string;
  walkFrame: number; walkTimer: number; isWalking: boolean;
  bobOffset: number; bobTimer: number;
  targetAgentLabel: string;
  targetRoomIndex: number;
  chatState: 'entering' | 'walking_to_agent' | 'chatting' | 'leaving';
  waypoints: { x: number; y: number }[];
  waypointIndex: number;
  chatTimer: number;
  avatarImg: HTMLImageElement | null;
  avatarLoaded: boolean;
  avatarUrl: string | undefined;
}

const VISITOR_SHIRT_COLORS = ['#2196F3','#FF9800','#4CAF50','#E91E63','#9C27B0','#00BCD4','#FF5722','#607D8B'];
const VISITOR_SKIN_COLORS = ['#FFCC80','#D4A574','#FFE0BD','#C68642','#8D5524','#F1C27D'];

function drawVisitorCharacter(ctx: CanvasRenderingContext2D, v: VisitorAnim, _time: number) {
  const { x, y, shirtColor, skinColor, isWalking, walkFrame, bobOffset, avatarImg, avatarLoaded } = v;
  const baseY = y + Math.floor(bobOffset);

  // Soft shadow beneath
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 21, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const legOffset = isWalking ? [[-1, 1], [1, -1], [1, -1], [-1, 1]][walkFrame % 4] : [0, 0];

  // Legs (jeans blue — small circles)
  ctx.fillStyle = '#1a5276';
  ctx.beginPath(); ctx.arc(x, baseY + 18 + legOffset[0], 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, baseY + 18 + legOffset[1], 2.5, 0, Math.PI * 2); ctx.fill();

  // Body / shirt — rounded rectangle
  roundRect(ctx, x - 3, baseY + 6, 10, 10, 3, shirtColor);

  // Arms
  roundRect(ctx, x - 5, baseY + 7, 3, 6, 1.5, shirtColor);
  roundRect(ctx, x + 6, baseY + 7, 3, 6, 1.5, shirtColor);
  // Hands
  ctx.fillStyle = skinColor;
  ctx.beginPath(); ctx.arc(x - 4, baseY + 13, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 7, baseY + 13, 1.5, 0, Math.PI * 2); ctx.fill();

  // Head
  if (avatarLoaded && avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 2, baseY + 1, 7, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, x - 5, baseY - 6, 14, 14);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 2, baseY + 1, 7, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Circle head
    ctx.fillStyle = skinColor;
    ctx.beginPath(); ctx.arc(x + 2, baseY + 1, 8, 0, Math.PI * 2); ctx.fill();
    // Eyes — 2 small dots
    ctx.fillStyle = '#1a1a2e';
    ctx.beginPath(); ctx.arc(x, baseY + 1, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, baseY + 1, 1.2, 0, Math.PI * 2); ctx.fill();
    // Simple cap (to differentiate)
    ctx.fillStyle = shirtColor;
    ctx.beginPath();
    ctx.arc(x + 2, baseY - 3, 7, Math.PI, 0);
    ctx.fill();
  }

  // Badge icon (S/W) above head
  const badgeColor = v.surface === 'slack' ? '#4A154B' : '#2196F3';
  ctx.fillStyle = badgeColor;
  ctx.beginPath(); ctx.arc(x + 2, baseY - 10, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold 5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(v.surface === 'slack' ? 'S' : 'W', x + 2, baseY - 10);
}

function drawCharacter(ctx: CanvasRenderingContext2D, agent: AgentAnim, time: number) {
  const { x, y, shirtColor, hairColor, isWalking, walkFrame, bobOffset, state, errorTimer } = agent;
  const baseY = y + Math.floor(bobOffset);
  let jumpY = 0;
  if (state === 'error' && errorTimer > 0) {
    jumpY = -Math.abs(Math.sin(errorTimer * 0.15)) * 4;
  }
  const dy = baseY + jumpY;

  // Soft shadow beneath
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.beginPath();
  ctx.ellipse(x + 2, y + 21, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const legOffset = isWalking ? [[-1, 1], [1, -1], [1, -1], [-1, 1]][walkFrame % 4] : [0, 0];

  // Legs — small circles, animate for walking
  ctx.fillStyle = '#3b3b5c';
  ctx.beginPath(); ctx.arc(x, dy + 18 + legOffset[0], 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, dy + 18 + legOffset[1], 2.5, 0, Math.PI * 2); ctx.fill();

  // Body — rounded rectangle
  roundRect(ctx, x - 3, dy + 6, 10, 10, 3, shirtColor);

  // Arms
  const armAnim = ACTIVE_STATES.has(state) ? Math.sin(time * 0.008) * 2 : 0;
  roundRect(ctx, x - 5, dy + 7 + Math.floor(armAnim), 3, 6, 1.5, shirtColor);
  roundRect(ctx, x + 6, dy + 7 - Math.floor(armAnim), 3, 6, 1.5, shirtColor);
  // Hands
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath(); ctx.arc(x - 4, dy + 13 + Math.floor(armAnim), 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 7, dy + 13 - Math.floor(armAnim), 1.5, 0, Math.PI * 2); ctx.fill();

  // Head — circle (skin color, 8px radius)
  ctx.fillStyle = '#FFCC80';
  ctx.beginPath(); ctx.arc(x + 2, dy + 1, 8, 0, Math.PI * 2); ctx.fill();

  // Eyes — 2 small dots
  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath(); ctx.arc(x, dy + 1, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 4, dy + 1, 1.2, 0, Math.PI * 2); ctx.fill();

  // Mouth
  if (state === 'error') {
    // Sad mouth
    ctx.strokeStyle = '#C62828';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 2, dy + 6, 2, Math.PI + 0.3, -0.3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#BF8B5E';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 2, dy + 3, 2, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }

  // Hair — colored semicircle on top of head
  ctx.fillStyle = hairColor;
  ctx.beginPath();
  ctx.arc(x + 2, dy - 2, 8, Math.PI, 0);
  ctx.fill();

  // Error exclamation mark
  if (state === 'error') {
    ctx.fillStyle = '#ef4444';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('!', x + 2, dy - 10);
  }

  // State indicator — colored ring around character
  if (agent.hovered || state !== 'idle') {
    const stateColor = STATE_COLORS[state] || '#fff';
    ctx.strokeStyle = hexToRgba(stateColor, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 2, dy + 6, 14, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ─── Thought bubbles (flat vector) ──────────────────────────────────────────
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawThoughtBubble(ctx: CanvasRenderingContext2D, monitorX: number, monitorY: number, text: string, color: string, time: number) {
  if (!text) return;

  const lines = wrapText(text, 40);
  const lineH = 13;
  const padding = 8;
  ctx.font = `10px ${FONT}`;
  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const bw = maxW + padding * 2;
  const bh = lines.length * lineH + padding * 2;

  const bobY = Math.sin(time * 0.002) * 2;
  const bx = monitorX - bw / 2;
  const by = monitorY - bh - 20 + bobY;

  const alpha = Math.min(1, (time % 10000) / 500);
  ctx.globalAlpha = alpha;

  // Trailing circles (thought bubble style)
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(monitorX, monitorY - 4, 2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(monitorX - 3, monitorY - 10, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(monitorX - 5, monitorY - 17 + bobY * 0.5, 4, 0, Math.PI * 2); ctx.fill();

  // White rounded rectangle with subtle shadow
  setShadow(ctx, 6, 0, 2, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();
  clearShadow(ctx);

  // Colored left border accent
  roundRect(ctx, bx, by, 3, bh, 1.5, color);

  // Text
  ctx.fillStyle = '#333';
  ctx.font = `10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + padding, by + padding + i * lineH);
  }

  ctx.globalAlpha = 1;
}

// ─── Speech bubbles (flat vector, pointed triangle tail) ────────────────────
function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  const lines = wrapText(text, 30);
  const lineH = 12;
  const padding = 6;
  ctx.font = `9px ${FONT}`;
  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const bw = Math.max(maxW + padding * 2, 30);
  const bh = lines.length * lineH + padding * 2;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(y - bh - 8);

  // White rounded rectangle with subtle shadow
  setShadow(ctx, 5, 0, 2, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 5);
  ctx.fill();
  clearShadow(ctx);

  // Colored left border accent
  roundRect(ctx, bx, by + 2, 3, bh - 4, 1.5, color);

  // Pointed triangle tail
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.moveTo(x - 4, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 4, by + bh);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.fillStyle = '#333';
  ctx.font = `9px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + padding, by + padding + i * lineH);
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PixelOffice({ agents, conversations = [], visitors = [] }: { agents: AgentState[]; conversations?: Conversation[]; visitors?: SlackVisitor[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const animRef = useRef<{
    agents: AgentAnim[];
    visitors: VisitorAnim[];
    mouseX: number;
    mouseY: number;
    time: number;
    frameId: number;
    conversations: Conversation[];
  }>({
    agents: [],
    visitors: [],
    mouseX: -999,
    mouseY: -999,
    time: 0,
    frameId: 0,
    conversations: [],
  });

  // Sync conversations
  useEffect(() => {
    animRef.current.conversations = conversations;
  }, [conversations]);

  // Sync visitor data to animation state
  useEffect(() => {
    const anim = animRef.current;
    const existing = new Map(anim.visitors.map(v => [v.id, v]));
    const currentIds = new Set(visitors.map(v => v.id));

    // Remove visitors no longer active — set them to leaving
    for (const v of anim.visitors) {
      if (!currentIds.has(v.id) && v.chatState !== 'leaving') {
        v.chatState = 'leaving';
        setWaypoints(v, pathTo(v.x, v.y, -30, v.y));
      }
    }

    // Add or update visitors
    for (const sv of visitors) {
      const prev = existing.get(sv.id);
      const agentIdx = agents.findIndex(a => a.label === sv.targetAgent);
      const targetRoom = agentIdx >= 0 ? agentIdx : 0;

      if (prev) {
        prev.targetAgentLabel = sv.targetAgent;
        prev.targetRoomIndex = targetRoom;
        prev.name = sv.name;
        if (sv.avatarUrl && sv.avatarUrl !== prev.avatarUrl) {
          prev.avatarUrl = sv.avatarUrl;
          prev.avatarLoaded = false;
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => { prev.avatarImg = img; prev.avatarLoaded = true; };
          img.src = sv.avatarUrl;
        }
        continue;
      }

      // New visitor — spawn on the nearest corridor, walk to agent via A*
      const h = hashStr(sv.id);
      const targetRow = Math.floor(targetRoom / COLS);
      const entryCorridorRow = targetRow < ROWS - 1 ? targetRow : targetRow - 1;
      const corridorCenterY = hCorridorY(entryCorridorRow);

      const newVisitor: VisitorAnim = {
        id: sv.id, name: sv.name, surface: sv.surface || 'slack',
        x: -20, y: corridorCenterY,
        targetX: -20, targetY: corridorCenterY,
        shirtColor: VISITOR_SHIRT_COLORS[h % VISITOR_SHIRT_COLORS.length],
        skinColor: VISITOR_SKIN_COLORS[(h >> 3) % VISITOR_SKIN_COLORS.length],
        walkFrame: 0, walkTimer: 0, isWalking: false,
        bobOffset: 0, bobTimer: Math.random() * Math.PI * 2,
        targetAgentLabel: sv.targetAgent,
        targetRoomIndex: targetRoom,
        chatState: 'entering',
        waypoints: [],
        waypointIndex: 0,
        chatTimer: 0,
        avatarImg: null, avatarLoaded: false, avatarUrl: sv.avatarUrl,
      };
      // Simple entry: walk onto the corridor from the left edge
      // walking_to_agent will use A* to reach the actual agent
      newVisitor.waypoints = [
        { x: 20, y: corridorCenterY },
      ];
      newVisitor.waypointIndex = 0;
      newVisitor.targetX = newVisitor.waypoints[0].x;
      newVisitor.targetY = newVisitor.waypoints[0].y;

      if (sv.avatarUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { newVisitor.avatarImg = img; newVisitor.avatarLoaded = true; };
        img.src = sv.avatarUrl;
      }

      anim.visitors.push(newVisitor);
    }

    // Clean up visitors that have left the screen
    anim.visitors = anim.visitors.filter(v => v.x > -40 || v.chatState !== 'leaving');
  }, [visitors, agents]);

  // Sync agent data to animation state
  useEffect(() => {
    const anim = animRef.current;
    const existing = new Map(anim.agents.map(a => [a.label, a]));

    const newAgents: AgentAnim[] = agents.map((a, i) => {
      const prev = existing.get(a.label);
      const h = hashStr(a.label);
      const chairPos = getChairPos(i);

      if (prev) {
        const stateChanged = prev.state !== a.state;
        let targetX = prev.targetX;
        let targetY = prev.targetY;
        if (stateChanged && prev.chatState === 'at_desk') {
          targetX = chairPos.x;
          targetY = chairPos.y;
        }
        return {
          ...prev,
          name: a.name,
          emoji: a.emoji,
          state: a.state,
          detail: a.detail,
          targetX,
          targetY,
          isWalking: stateChanged ? true : prev.isWalking,
          errorTimer: a.state === 'error' ? (prev.errorTimer || 100) : 0,
          roomIndex: i,
        };
      }

      // Idle agents start in break room — no walk animation on page load
      const isIdle = a.state === 'idle';
      const startPos = isIdle ? getBreakRoomSeat(i) : chairPos;

      return {
        label: a.label, name: a.name, emoji: a.emoji,
        state: a.state, detail: a.detail,
        x: startPos.x, y: startPos.y,
        targetX: startPos.x, targetY: startPos.y,
        shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
        hairColor: HAIR_COLORS[(h >> 4) % HAIR_COLORS.length],
        hairStyle: HAIR_STYLES[(h >> 8) % HAIR_STYLES.length],
        walkFrame: 0, walkTimer: 0, isWalking: false,
        bobOffset: 0, bobTimer: Math.random() * Math.PI * 2,
        errorTimer: a.state === 'error' ? 100 : 0,
        hovered: false,
        roomIndex: i,
        chatState: isIdle ? 'in_break_room' as const : 'at_desk' as const,
        chatTarget: -1,
        waypoints: [],
        waypointIndex: 0,
        chatMessageIndex: 0,
        chatTimer: 0,
        conversationId: null,
      };
    });

    anim.agents = newAgents;
  }, [agents]);

  // Mouse tracking for hover
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    animRef.current.mouseX = (e.clientX - rect.left) * scaleX;
    animRef.current.mouseY = (e.clientY - rect.top) * scaleY;
  }, []);

  const handleMouseLeave = useCallback(() => {
    animRef.current.mouseX = -999;
    animRef.current.mouseY = -999;
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;

    let lastTime = 0;

    function render(timestamp: number) {
      const dt = Math.min(timestamp - lastTime, 50); // cap dt
      lastTime = timestamp;
      const anim = animRef.current;
      anim.time = timestamp;

      // ─── Update conversations → agent chat states ───
      const convMap = new Map(anim.conversations.map(c => [c.id, c]));
      const activeConvIds = convMap;
      const agentMap = new Map(anim.agents.map(a => [a.label, a]));

      // End conversations that disappeared
      for (const a of anim.agents) {
        if (a.conversationId && !activeConvIds.has(a.conversationId)) {
          if (a.chatState === 'chatting') {
            a.chatState = 'walking_home';
            const homeChair = getChairPos(a.roomIndex);
            a.waypoints = getCorridorWaypoints(a.chatTarget, a.roomIndex);
            a.waypoints.push(homeChair);
            a.waypointIndex = 0;
            a.targetX = a.waypoints[0].x;
            a.targetY = a.waypoints[0].y;
          } else if (a.chatState === 'walking_to_chat') {
            a.chatState = 'walking_home';
            const homeChair = getChairPos(a.roomIndex);
            setWaypoints(a, pathTo(a.x, a.y, homeChair.x, homeChair.y));
          }
          if (a.chatState === 'at_desk') {
            a.conversationId = null;
          }
        }
      }

      // Start new conversations
      for (const conv of anim.conversations) {
        const [label1, label2] = conv.participants;
        const a1 = agentMap.get(label1);
        const a2 = agentMap.get(label2);
        if (!a1 || !a2) continue;

        const stayer = a1.roomIndex < a2.roomIndex ? a1 : a2;
        const visitor = a1.roomIndex < a2.roomIndex ? a2 : a1;

        if (visitor.conversationId === conv.id) continue;
        if (visitor.chatState !== 'at_desk') continue;

        visitor.conversationId = conv.id;
        visitor.chatState = 'walking_to_chat';
        visitor.chatTarget = stayer.roomIndex;
        visitor.waypoints = getCorridorWaypoints(visitor.roomIndex, stayer.roomIndex);
        const stayerChair = getChairPos(stayer.roomIndex);
        visitor.waypoints.push({ x: stayerChair.x + 20, y: stayerChair.y + 10 });
        visitor.waypointIndex = 0;
        visitor.targetX = visitor.waypoints[0].x;
        visitor.targetY = visitor.waypoints[0].y;
        visitor.chatMessageIndex = 0;
        visitor.chatTimer = 0;

        stayer.conversationId = conv.id;
        stayer.chatMessageIndex = 0;
        stayer.chatTimer = 0;
      }

      // ─── Idle agents → break room, active agents → back to desk ───
      for (const a of anim.agents) {
        const isIdle = a.state === 'idle';
        const isBusy = ACTIVE_STATES.has(a.state) || a.state === 'error';

        if (isIdle && a.chatState === 'at_desk' && !a.conversationId && !a.isWalking) {
          a.chatState = 'walking_to_break';
          const seat = getBreakRoomSeat(a.roomIndex);
          a.waypoints = getBreakRoomWaypoints(a.roomIndex, seat);
          if (a.waypoints.length > 0) {
            a.waypointIndex = 0;
            a.targetX = a.waypoints[0].x;
            a.targetY = a.waypoints[0].y;
          }
        } else if (isBusy && a.chatState === 'in_break_room') {
          a.chatState = 'walking_from_break';
          a.waypoints = getReturnFromBreakWaypoints(a.roomIndex, a.x, a.y);
          if (a.waypoints.length > 0) {
            a.waypointIndex = 0;
            a.targetX = a.waypoints[0].x;
            a.targetY = a.waypoints[0].y;
          }
        }
      }

      // ─── Update agents ───
      const WALK_SPEED = 1.6;
      const CORNER_RADIUS = 12;

      for (const a of anim.agents) {
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          a.isWalking = true;

          const isTransit = a.chatState === 'walking_to_chat' || a.chatState === 'walking_home'
            || a.chatState === 'walking_to_break' || a.chatState === 'walking_from_break';
          let moveX = (dx / dist) * WALK_SPEED;
          let moveY = (dy / dist) * WALK_SPEED;

          if (isTransit && dist < CORNER_RADIUS && a.waypointIndex < a.waypoints.length - 1) {
            const nextWp = a.waypoints[a.waypointIndex + 1];
            if (nextWp) {
              const ndx = nextWp.x - a.targetX;
              const ndy = nextWp.y - a.targetY;
              const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
              if (ndist > 0) {
                const blend = 1 - (dist / CORNER_RADIUS);
                const nextDirX = ndx / ndist;
                const nextDirY = ndy / ndist;
                const curDirX = dx / dist;
                const curDirY = dy / dist;
                const blendX = curDirX * (1 - blend) + nextDirX * blend;
                const blendY = curDirY * (1 - blend) + nextDirY * blend;
                const blendDist = Math.sqrt(blendX * blendX + blendY * blendY);
                if (blendDist > 0) {
                  moveX = (blendX / blendDist) * WALK_SPEED;
                  moveY = (blendY / blendDist) * WALK_SPEED;
                }
              }
            }
          }

          a.x += moveX;
          a.y += moveY;

          a.walkTimer += dt;
          if (a.walkTimer > 120) {
            a.walkFrame = (a.walkFrame + 1) % 4;
            a.walkTimer = 0;
          }
        } else {
          a.isWalking = false;
          a.x = a.targetX;
          a.y = a.targetY;

          const isTransit = a.chatState === 'walking_to_chat' || a.chatState === 'walking_home'
            || a.chatState === 'walking_to_break' || a.chatState === 'walking_from_break';
          if (isTransit && a.waypoints.length > 0) {
            a.waypointIndex++;
            if (a.waypointIndex < a.waypoints.length) {
              a.targetX = a.waypoints[a.waypointIndex].x;
              a.targetY = a.waypoints[a.waypointIndex].y;
            } else {
              if (a.chatState === 'walking_to_chat') {
                a.chatState = 'chatting';
                a.chatTimer = 0;
              } else if (a.chatState === 'walking_to_break') {
                a.chatState = 'in_break_room';
              } else if (a.chatState === 'walking_from_break') {
                a.chatState = 'at_desk';
                const homeChair = getChairPos(a.roomIndex);
                a.targetX = homeChair.x;
                a.targetY = homeChair.y;
              } else {
                a.chatState = 'at_desk';
                a.conversationId = null;
                const homeChair = getChairPos(a.roomIndex);
                a.targetX = homeChair.x;
                a.targetY = homeChair.y;
              }
              a.waypoints = [];
              a.waypointIndex = 0;
            }
          }
        }

        // Bobbing
        a.bobTimer += dt * 0.003;
        a.bobOffset = Math.sin(a.bobTimer) * 1.2;

        // Error timer
        if (a.errorTimer > 0) a.errorTimer -= dt * 0.01;

        // Chat message cycling
        if (a.chatState === 'chatting') {
          a.chatTimer += dt;
          if (a.chatTimer > 3000) {
            a.chatTimer = 0;
            a.chatMessageIndex++;
          }
        }

        // Hover check
        const mx = anim.mouseX, my = anim.mouseY;
        a.hovered = (mx > a.x - 10 && mx < a.x + 14 && my > a.y - 10 && my < a.y + 25);
      }

      // ─── Update visitors ───
      const VISITOR_SPEED = 1.4;
      for (const v of anim.visitors) {
        const dx = v.targetX - v.x;
        const dy = v.targetY - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.2) {
          v.isWalking = true;
          let moveX = (dx / dist) * VISITOR_SPEED;
          let moveY = (dy / dist) * VISITOR_SPEED;

          if (dist < CORNER_RADIUS && v.waypointIndex < v.waypoints.length - 1) {
            const nextWp = v.waypoints[v.waypointIndex + 1];
            if (nextWp) {
              const ndx = nextWp.x - v.targetX;
              const ndy = nextWp.y - v.targetY;
              const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
              if (ndist > 0) {
                const blend = 1 - (dist / CORNER_RADIUS);
                const bx = (dx / dist) * (1 - blend) + (ndx / ndist) * blend;
                const by = (dy / dist) * (1 - blend) + (ndy / ndist) * blend;
                const bd = Math.sqrt(bx * bx + by * by);
                if (bd > 0) { moveX = (bx / bd) * VISITOR_SPEED; moveY = (by / bd) * VISITOR_SPEED; }
              }
            }
          }

          v.x += moveX;
          v.y += moveY;
          v.walkTimer += dt;
          if (v.walkTimer > 130) {
            v.walkFrame = (v.walkFrame + 1) % 4;
            v.walkTimer = 0;
          }
        } else {
          v.isWalking = false;
          v.x = v.targetX;
          v.y = v.targetY;

          if (v.waypoints.length > 0) {
            v.waypointIndex++;
            if (v.waypointIndex < v.waypoints.length) {
              v.targetX = v.waypoints[v.waypointIndex].x;
              v.targetY = v.waypoints[v.waypointIndex].y;
            } else {
              v.waypoints = [];
              v.waypointIndex = 0;
              if (v.chatState === 'entering') {
                // Arrived at spawn — now walk to the target agent
                v.chatState = 'walking_to_agent';
                // Find the agent and pathfind to them
                const targetAgent = anim.agents.find(a => a.label === v.targetAgentLabel);
                if (targetAgent) {
                  const vi = anim.visitors.indexOf(v);
                  const angle = (vi * 1.5 + 0.5) % (Math.PI * 2);
                  const offX = Math.cos(angle) * 30;
                  const offY = Math.sin(angle) * 30;
                  setWaypoints(v, pathTo(v.x, v.y, targetAgent.x + offX, targetAgent.y + offY));
                }
              } else if (v.chatState === 'walking_to_agent') {
                v.chatState = 'chatting';
                v.chatTimer = 0;
              }
            }
          }
        }

        // Visitor chat timer — auto-leave after 20 seconds
        if (v.chatState === 'chatting') {
          v.chatTimer += dt;
          if (v.chatTimer > 20000) {
            v.chatState = 'leaving';
            setWaypoints(v, pathTo(v.x, v.y, -30, v.y));
            v.chatTimer = 0;
          }
        }

        v.bobTimer += dt * 0.003;
        v.bobOffset = Math.sin(v.bobTimer) * 1.0;
      }

      // ─── Draw ───
      if (!canvas) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Background — soft gradient (light sky to white)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#E8F4FD');
      bgGrad.addColorStop(0.4, '#F0EDE8');
      bgGrad.addColorStop(1, '#E8E4DE');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // Draw corridors first (behind rooms)
      drawCorridors(ctx);

      // Draw break room
      drawBreakRoom(ctx, timestamp);

      // Draw rooms
      for (let i = 0; i < COLS * ROWS; i++) {
        const agent = anim.agents[i];
        if (agent) {
          const glowColor = STATE_COLORS[agent.state] || undefined;
          const isError = agent.state === 'error';
          drawRoom(ctx, i, agent.label, agent.name, agent.emoji, glowColor, isError, timestamp);
        } else {
          drawRoom(ctx, i, `room${i}`, `Room ${i}`, '', undefined, false, timestamp);
        }
      }

      // Draw characters sorted by Y
      const sorted = [...anim.agents].sort((a, b) => a.y - b.y);
      for (const agent of sorted) {
        drawCharacter(ctx, agent, timestamp);

        // Thought bubble from monitor (active, non-chatting agents)
        if (ACTIVE_STATES.has(agent.state) && agent.chatState !== 'chatting' && agent.chatState !== 'walking_to_chat') {
          const monPos = getMonitorPos(agent.roomIndex);
          const color = STATE_COLORS[agent.state] || '#64748b';
          drawThoughtBubble(ctx, monPos.x, monPos.y, agent.detail || agent.state, color, timestamp);
        }

        // Chat speech bubbles
        if (agent.chatState === 'chatting' && agent.conversationId) {
          const conv = convMap.get(agent.conversationId);
          if (conv && conv.messages.length > 0) {
            const msgIdx = agent.chatMessageIndex % conv.messages.length;
            const msg = conv.messages[msgIdx];
            if (msg.from === agent.label) {
              const color = STATE_COLORS[agent.state] || '#64748b';
              drawSpeechBubble(ctx, agent.x + 2, agent.y + agent.bobOffset - 16, msg.text, color);
            }
          }
        }

        // Name label
        if (agent.hovered || agent.chatState === 'at_desk') {
          drawCleanText(ctx, `${agent.emoji} ${agent.name}`, agent.x + 2, agent.y + 22, '#555', 9);
        }
      }

      // ─── Draw visitors ───
      const sortedVisitors = [...anim.visitors].sort((a, b) => a.y - b.y);
      for (const v of sortedVisitors) {
        drawVisitorCharacter(ctx, v, timestamp);

        // Name label
        const badgeIcon = v.surface === 'slack' ? '#' : '@';
        drawCleanText(ctx, `${badgeIcon}${v.name}`, v.x + 2, v.y + 22, '#5C9BC8', 8);

        // Speech bubble when chatting
        if (v.chatState === 'chatting') {
          const bubbleText = `${v.name} chatting with ${v.targetAgentLabel}`;
          drawSpeechBubble(ctx, v.x + 2, v.y + v.bobOffset - 16, bubbleText, '#4A154B');
        }
      }

      anim.frameId = requestAnimationFrame(render);
    }

    animRef.current.frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current.frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handler — fill container, render at device pixel ratio
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = container.clientWidth;
      const ch = container.clientHeight || (cw * H / W);
      const scale = cw / W;
      const displayW = cw;
      const displayH = H * scale;
      canvas.width = Math.floor(displayW * dpr);
      canvas.height = Math.floor(displayH * dpr);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr * scale, dpr * scale);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  return (
    <div ref={containerRef} className={`w-full relative ${isFullscreen ? 'bg-[#F0EDE8]' : ''}`}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full rounded-lg"
      />
      <button
        onClick={toggleFullscreen}
        className="absolute top-3 right-3 z-10 p-2 rounded-lg bg-black/30 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-black/50 transition-colors"
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isFullscreen ? (
            <>
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          ) : (
            <>
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

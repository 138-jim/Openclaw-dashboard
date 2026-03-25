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

function darken(hex: string, amt: number): string {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.max(0, r - amt); g = Math.max(0, g - amt); b = Math.max(0, b - amt);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function lighten(hex: string, amt: number): string {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
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

// Room door center (bottom wall, center)
function getDoorPos(roomIndex: number): { x: number; y: number } {
  const o = getRoomOrigin(roomIndex);
  return { x: o.x + ROOM_W / 2, y: o.y + ROOM_H };
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

function buildNavGraph() {
  navGraph.clear();

  const addNode = (id: string, x: number, y: number) => {
    if (!navGraph.has(id)) navGraph.set(id, { id, x, y, neighbors: [] });
  };
  const addEdge = (a: string, b: string) => {
    const na = navGraph.get(a)!, nb = navGraph.get(b)!;
    if (!na.neighbors.includes(b)) na.neighbors.push(b);
    if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
  };

  // Door nodes for each room
  for (let i = 0; i < COLS * ROWS; i++) {
    const door = getDoorPos(i);
    addNode(`door_${i}`, door.x, door.y);
  }

  // Corridor intersection nodes — at every crossing of h-corridor and v-corridor
  // Plus door-to-corridor connections
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = hCorridorY(row);

    // Nodes along this horizontal corridor at each door position and v-corridor crossing
    const hNodes: string[] = [];

    // Door projections onto this h-corridor (rooms above: row, and below: row+1)
    for (let col = 0; col < COLS; col++) {
      // Room above (row r) — door is at bottom, corridor is right below
      const roomAbove = row * COLS + col;
      const doorAbove = getDoorPos(roomAbove);
      const hId = `hc_${row}_door_${roomAbove}`;
      addNode(hId, doorAbove.x, cy);
      addEdge(`door_${roomAbove}`, hId);
      hNodes.push(hId);

      // Room below (row r+1) — door is at bottom, corridor is above
      const roomBelow = (row + 1) * COLS + col;
      const doorBelow = getDoorPos(roomBelow);
      // For the room below, its door is at the bottom — we need to connect
      // to the corridor above it. The corridor above row+1 is corridor row.
      // But the door of roomBelow is at the bottom of roomBelow, which connects
      // to corridor row+1 (if it exists) or corridor row.
      // Actually: room (row+1) door connects to the corridor below it (row+1)
      // if it exists, or the one above (row). For simplicity, also connect
      // roomBelow's door to this corridor if it's adjacent.
      if (row + 1 < ROWS - 1) {
        // roomBelow connects to corridor row+1, not this one
      } else {
        // roomBelow is in the last row — connect its door to this corridor (above it)
        const hIdBelow = `hc_${row}_door_${roomBelow}`;
        addNode(hIdBelow, doorBelow.x, cy);
        // Door of bottom-row room: need to walk up to the corridor
        addEdge(`door_${roomBelow}`, hIdBelow);
        hNodes.push(hIdBelow);
      }
    }

    // Also: rooms in row+1 have doors that go DOWN to corridor row+1,
    // but we need them accessible from corridor row too via v-corridors.
    // V-corridor intersection nodes
    for (let col = 0; col < COLS - 1; col++) {
      const cx = vCorridorX(col);
      const intId = `int_${row}_${col}`;
      addNode(intId, cx, cy);
      hNodes.push(intId);
    }

    // Break room corridor intersection (rightmost)
    const breakCorrX = GRID_W + CORRIDOR / 2;
    const breakIntId = `int_${row}_break`;
    addNode(breakIntId, breakCorrX, cy);
    hNodes.push(breakIntId);

    // Connect all h-corridor nodes horizontally (sort by x, connect adjacent)
    hNodes.sort((a, b) => navGraph.get(a)!.x - navGraph.get(b)!.x);
    for (let j = 0; j < hNodes.length - 1; j++) {
      addEdge(hNodes[j], hNodes[j + 1]);
    }
  }

  // Connect v-corridor intersections vertically
  for (let col = 0; col < COLS - 1; col++) {
    for (let row = 0; row < ROWS - 2; row++) {
      addEdge(`int_${row}_${col}`, `int_${row + 1}_${col}`);
    }
  }

  // Connect break room corridor vertically
  for (let row = 0; row < ROWS - 2; row++) {
    addEdge(`int_${row}_break`, `int_${row + 1}_break`);
  }

  // Connect rooms in row+1..row+2..etc doors to the corridor above them
  // (rooms not in the last row connect to the corridor below them,
  //  which is handled above. Rooms in middle rows also connect to corridor above.)
  for (let row = 1; row < ROWS; row++) {
    const cyAbove = hCorridorY(row - 1);
    for (let col = 0; col < COLS; col++) {
      const room = row * COLS + col;
      const door = getDoorPos(room);
      // If this room's door is close to the corridor above (within ROOM_H),
      // connect it. Actually doors are at room bottom, corridor row-1 is above.
      // Need a node on corridor row-1 at this door's x.
      if (row - 1 >= 0 && row < ROWS) {
        // Check if we already have a hc node for this door on corridor row-1
        const existingId = `hc_${row - 1}_door_${room}`;
        if (!navGraph.has(existingId)) {
          addNode(existingId, door.x, cyAbove);
          addEdge(`door_${room}`, existingId);
          // Connect to nearest h-corridor neighbors
          // Find the intersections on corridor row-1 to the left and right
          const col_left = col > 0 ? col - 1 : -1;
          const col_right = col < COLS - 1 ? col : -1;
          if (col_left >= 0 && navGraph.has(`int_${row - 1}_${col_left}`)) {
            addEdge(existingId, `int_${row - 1}_${col_left}`);
          }
          if (col_right >= 0 && navGraph.has(`int_${row - 1}_${col_right}`)) {
            addEdge(existingId, `int_${row - 1}_${col_right}`);
          }
          // Connect to other door projections on same corridor
          for (let c2 = 0; c2 < COLS; c2++) {
            const otherId = `hc_${row - 1}_door_${(row - 1) * COLS + c2}`;
            if (navGraph.has(otherId)) addEdge(existingId, otherId);
            const otherId2 = `hc_${row - 1}_door_${row * COLS + c2}`;
            if (navGraph.has(otherId2) && otherId2 !== existingId) addEdge(existingId, otherId2);
          }
          // Connect to break corridor
          if (navGraph.has(`int_${row - 1}_break`)) {
            addEdge(existingId, `int_${row - 1}_break`);
          }
        }
      }
    }
  }

  // Break room entry node
  const breakEntryId = 'break_entry';
  addNode(breakEntryId, GRID_W + CORRIDOR / 2, GRID_H / 2);
  // Connect to all break corridor intersections
  for (let row = 0; row < ROWS - 1; row++) {
    addEdge(breakEntryId, `int_${row}_break`);
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

  if (!bestStartId || !bestEndId || bestStartId === bestEndId) {
    return [{ x: endX, y: endY }];
  }

  // A* search
  // Use plain objects for ES5 compatibility (no for...of on Map/Set)
  const openList = [bestStartId];
  const closedSet: Record<string, boolean> = {};
  const cameFrom: Record<string, string> = {};
  const gScore: Record<string, number> = {};
  const fScore: Record<string, number> = {};

  gScore[bestStartId] = 0;
  const endNode = navGraph.get(bestEndId)!;
  fScore[bestStartId] = Math.hypot(navGraph.get(bestStartId)!.x - endNode.x, navGraph.get(bestStartId)!.y - endNode.y);

  while (openList.length > 0) {
    // Find node in openList with lowest fScore
    let bestIdx = 0;
    for (let i = 1; i < openList.length; i++) {
      if ((fScore[openList[i]] ?? Infinity) < (fScore[openList[bestIdx]] ?? Infinity)) {
        bestIdx = i;
      }
    }
    const current = openList[bestIdx];

    if (current === bestEndId) {
      // Reconstruct path
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

  // No path found — fallback direct
  return [{ x: endX, y: endY }];
}

// ─── Convenience pathfinding functions using A* ──────────────────────────────
function getCorridorWaypoints(fromRoom: number, toRoom: number): { x: number; y: number }[] {
  const fromDoor = getDoorPos(fromRoom);
  const toDoor = getDoorPos(toRoom);
  const path = aStar(fromDoor.x, fromDoor.y, toDoor.x, toDoor.y);
  return path;
}

function getRoomDecorations(label: string): [DecorationType, DecorationType] {
  const h = hashStr(label);
  const d1 = DECORATION_TYPES[h % DECORATION_TYPES.length];
  const d2 = DECORATION_TYPES[(h >> 4) % DECORATION_TYPES.length];
  return d1 === d2
    ? [d1, DECORATION_TYPES[(h >> 8) % DECORATION_TYPES.length]]
    : [d1, d2];
}

// ─── Drawing helpers ────────────────────────────────────────────────────────
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size = 8) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, Math.floor(x), Math.floor(y));
}

// ─── Furniture drawing ──────────────────────────────────────────────────────

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, glowColor?: string) {
  drawRect(ctx, x + 2, y + 18, 40, 3, 'rgba(0,0,0,0.15)');
  drawRect(ctx, x + 2, y + 12, 2, 8, '#6D4C41');
  drawRect(ctx, x + 36, y + 12, 2, 8, '#6D4C41');
  drawRect(ctx, x, y + 10, 40, 4, '#8D6E63');
  drawRect(ctx, x + 1, y + 10, 38, 1, '#A1887F');
  drawRect(ctx, x + 14, y + 1, 14, 10, '#37474F');
  drawRect(ctx, x + 15, y + 2, 12, 7, glowColor || '#263238');
  drawRect(ctx, x + 19, y + 10, 4, 2, '#546E7A');
  if (glowColor && glowColor !== '#263238') {
    ctx.fillStyle = hexToRgba(glowColor, 0.08);
    ctx.fillRect(x + 8, y - 2, 26, 18);
  }
  drawRect(ctx, x + 12, y + 11, 10, 2, '#90A4AE');
  drawRect(ctx, x + 13, y + 11, 8, 1, '#B0BEC5');
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y, 12, 4, '#455A64');
  drawRect(ctx, x + 1, y, 10, 1, '#546E7A');
  drawRect(ctx, x + 1, y - 8, 10, 9, '#37474F');
  drawRect(ctx, x + 2, y - 7, 8, 7, '#455A64');
  drawRect(ctx, x + 2, y + 4, 2, 4, '#333');
  drawRect(ctx, x + 8, y + 4, 2, 4, '#333');
  drawRect(ctx, x + 1, y + 7, 3, 2, '#555');
  drawRect(ctx, x + 8, y + 7, 3, 2, '#555');
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y + 6, 8, 6, '#D84315');
  drawRect(ctx, x - 1, y + 5, 10, 2, '#BF360C');
  drawRect(ctx, x + 1, y + 7, 6, 1, '#E64A19');
  drawRect(ctx, x + 1, y + 5, 6, 1, '#3E2723');
  drawRect(ctx, x + 2, y + 1, 4, 5, '#2E7D32');
  drawRect(ctx, x, y - 1, 3, 4, '#388E3C');
  drawRect(ctx, x + 5, y, 3, 3, '#43A047');
  drawRect(ctx, x + 3, y - 2, 2, 3, '#1B5E20');
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  drawRect(ctx, x + 3, y, 2, 20, '#757575');
  drawRect(ctx, x - 2, y - 4, 12, 5, on ? '#FFF59D' : '#9E9E9E');
  drawRect(ctx, x - 1, y - 3, 10, 3, on ? '#FFF176' : '#BDBDBD');
  if (on) {
    ctx.fillStyle = 'rgba(255,245,157,0.06)';
    ctx.beginPath();
    ctx.arc(x + 4, y + 10, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  drawRect(ctx, x + 3, y + 28, 22, 3, 'rgba(0,0,0,0.12)');
  drawRect(ctx, x, y, 24, 30, '#455A64');
  drawRect(ctx, x + 1, y + 1, 22, 28, '#546E7A');
  drawRect(ctx, x + 3, y + 3, 18, 10, '#263238');
  drawRect(ctx, x + 5, y + 15, 3, 3, '#4CAF50');
  drawRect(ctx, x + 10, y + 15, 3, 3, '#F44336');
  drawRect(ctx, x + 15, y + 15, 3, 3, '#FFC107');
  drawRect(ctx, x + 6, y + 20, 12, 8, '#37474F');
  drawRect(ctx, x + 8, y + 22, 8, 5, '#263238');
  drawRect(ctx, x + 9, y + 23, 6, 4, '#ECEFF1');
  const steamPhases = [0, 2.1, 4.2];
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const phase of steamPhases) {
    const t = (time * 0.002 + phase) % 3;
    if (t < 2) {
      const sy = y - 2 - t * 6;
      const sx = x + 11 + Math.sin(t * 3 + phase) * 2;
      const size = 1 + (1 - t / 2) * 1.5;
      ctx.globalAlpha = 0.3 * (1 - t / 2);
      ctx.fillRect(Math.floor(sx), Math.floor(sy), Math.ceil(size), Math.ceil(size));
    }
  }
  ctx.globalAlpha = 1;
}

function drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y, 40, 50, '#4E342E');
  drawRect(ctx, x + 2, y + 2, 36, 46, '#5D4037');
  const bookColors = ['#C62828','#1565C0','#2E7D32','#F9A825','#6A1B9A','#00838F','#EF6C00','#AD1457'];
  for (let s = 0; s < 3; s++) {
    const sy = y + 4 + s * 15;
    drawRect(ctx, x + 2, sy + 12, 36, 2, '#3E2723');
    let bx = x + 3;
    for (let b = 0; b < 6; b++) {
      const bw = 3 + (s * 3 + b) % 3;
      const bh = 10 + (b % 2);
      const bc = bookColors[(s * 6 + b) % bookColors.length];
      drawRect(ctx, bx, sy + 12 - bh, bw, bh, bc);
      drawRect(ctx, bx, sy + 12 - bh, bw, 1, lighten(bc, 30));
      bx += bw + 1;
    }
  }
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  drawRect(ctx, x + 3, y + 48, 28, 4, 'rgba(0,0,0,0.15)');
  drawRect(ctx, x, y, 30, 50, '#263238');
  drawRect(ctx, x + 1, y + 1, 28, 48, '#37474F');
  for (let u = 0; u < 5; u++) {
    const uy = y + 3 + u * 9;
    drawRect(ctx, x + 3, uy, 24, 7, '#1a1a2e');
    drawRect(ctx, x + 4, uy + 1, 22, 1, '#2d2d44');
    for (let v = 0; v < 4; v++) {
      drawRect(ctx, x + 14 + v * 3, uy + 3, 1, 2, '#111');
    }
  }
  // Inline LEDs
  const ledColors = ['#4CAF50', '#F44336', '#2196F3', '#FFC107'];
  for (let i = 0; i < 6; i++) {
    const lx = x + 5 + (i % 3) * 3;
    const ly = y + 5 + Math.floor(i / 3) * 9;
    const phase = i * 1.7;
    const on = Math.sin(time * 0.003 * (0.5 + (i % 3) * 0.5) + phase) > 0;
    if (on) {
      const c = ledColors[i % ledColors.length];
      drawRect(ctx, lx, ly, 2, 2, c);
      ctx.fillStyle = hexToRgba(c, 0.15);
      ctx.fillRect(lx - 1, ly - 1, 4, 4);
    } else {
      drawRect(ctx, lx, ly, 2, 2, '#1a1a1a');
    }
  }
}

function drawFramedPicture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y, 30, 24, '#5D4037');
  drawRect(ctx, x + 1, y + 1, 28, 22, '#6D4C41');
  drawRect(ctx, x + 3, y + 3, 24, 18, '#E8D5B7');
  drawRect(ctx, x + 3, y + 3, 24, 9, '#87CEEB');
  drawRect(ctx, x + 3, y + 12, 24, 9, '#4CAF50');
  drawRect(ctx, x + 20, y + 5, 4, 4, '#FFD700');
  for (let i = 0; i < 8; i++) {
    drawRect(ctx, x + 7 + i, y + 10 - Math.floor(Math.abs(i - 4) * 0.5), 1, 2, '#388E3C');
  }
}

function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, _time: number) {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  drawRect(ctx, cx - 11, cy - 11, 22, 22, '#5D4037');
  drawRect(ctx, cx - 10, cy - 10, 20, 20, '#FFFDE7');
  for (let h = 0; h < 12; h++) {
    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.round(Math.cos(angle) * 7);
    const dy = Math.round(Math.sin(angle) * 7);
    drawRect(ctx, cx + dx, cy + dy, 1, 1, '#333');
  }
  const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    drawRect(ctx, Math.round(cx + Math.cos(hAngle) * i), Math.round(cy + Math.sin(hAngle) * i), 1, 1, '#333');
  }
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    drawRect(ctx, Math.round(cx + Math.cos(mAngle) * i), Math.round(cy + Math.sin(mAngle) * i), 1, 1, '#666');
  }
  drawRect(ctx, cx, cy, 1, 1, '#C62828');
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y, 50, 32, '#BDBDBD');
  drawRect(ctx, x + 2, y + 2, 46, 28, '#FAFAFA');
  for (let i = 0; i < 4; i++) {
    const sy = y + 6 + i * 6;
    const sw = 20 + (i * 7) % 15;
    drawRect(ctx, x + 6, sy, sw, 1, '#1565C0');
  }
  drawRect(ctx, x + 38, y + 8, 3, 3, '#E53935');
  drawRect(ctx, x + 5, y + 32, 40, 3, '#9E9E9E');
  drawRect(ctx, x + 10, y + 31, 4, 2, '#F44336');
  drawRect(ctx, x + 16, y + 31, 4, 2, '#2196F3');
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

// ─── Room drawing ───────────────────────────────────────────────────────────
// Modern light wood floor
const FLOOR_COLORS = ['#D4B896','#CEAE88','#D9BD9C','#C9A87C','#D0B490'];
// Accent wall colors per room — warm, modern palette
const ACCENT_WALLS = [
  '#5B7FA5','#7B6B8D','#6B8E6B','#B0785A','#5A8A8A','#8B6B6B','#6B7B8B','#8A7B5A',
  '#6B8B7B','#7B6B7B','#5B8B6B','#8B7B6B','#6B6B8B','#7B8B5B','#8B5B6B','#5B7B8B',
  '#7B8B6B','#6B5B8B','#8B6B7B','#5B8B8B',
];

function drawRoom(ctx: CanvasRenderingContext2D, roomIndex: number, label: string, name: string, emoji: string, glowColor: string | undefined, isError: boolean, time: number) {
  const o = getRoomOrigin(roomIndex);
  const wallH = 40;
  const wallThick = 5;
  const accent = ACCENT_WALLS[roomIndex % ACCENT_WALLS.length];

  // ── Floor: warm hardwood ──
  drawRect(ctx, o.x + wallThick, o.y + wallH, ROOM_W - wallThick * 2, ROOM_H - wallH, '#C8B08A');
  const plankW = 18, plankH = 9;
  for (let y = o.y + wallH; y < o.y + ROOM_H; y += plankH) {
    const rowOff = ((y - o.y) / plankH) % 2 === 0 ? 0 : plankW / 2;
    for (let x = o.x + wallThick; x < o.x + ROOM_W - wallThick; x += plankW) {
      const px = x + rowOff;
      if (px >= o.x + ROOM_W - wallThick) continue;
      const ci = (Math.floor(px / plankW) * 3 + Math.floor(y / plankH) * 7) % FLOOR_COLORS.length;
      const w = Math.min(plankW, o.x + ROOM_W - wallThick - px);
      if (w > 0) {
        drawRect(ctx, px, y, w, plankH, FLOOR_COLORS[ci]);
        drawRect(ctx, px, y + plankH - 1, w, 1, darken(FLOOR_COLORS[ci], 10));
      }
    }
  }

  // Error red floor glow
  if (isError) {
    const pulse = 0.06 + Math.sin(time * 0.002) * 0.03;
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.fillRect(o.x + wallThick, o.y + wallH, ROOM_W - wallThick * 2, ROOM_H - wallH);
  }

  // ── Back wall with accent color and window ──
  drawRect(ctx, o.x, o.y, ROOM_W, wallH, accent);
  // Gradient overlay for depth
  const grd = ctx.createLinearGradient(o.x, o.y, o.x, o.y + wallH);
  grd.addColorStop(0, 'rgba(255,255,255,0.15)');
  grd.addColorStop(0.7, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grd;
  ctx.fillRect(o.x, o.y, ROOM_W, wallH);

  // Window on back wall (shows sky blue)
  const winW = 50, winH = 22;
  const winX = o.x + ROOM_W - 70, winY = o.y + 6;
  drawRect(ctx, winX - 1, winY - 1, winW + 2, winH + 2, darken(accent, 15)); // frame
  drawRect(ctx, winX, winY, winW, winH, '#87CEEB'); // sky
  drawRect(ctx, winX, winY + winH - 6, winW, 6, '#98D8C8'); // distant hills
  drawRect(ctx, winX + winW / 2, winY, 1, winH, darken(accent, 10)); // divider
  drawRect(ctx, winX, winY + winH / 2, winW, 1, darken(accent, 10));
  // Sunlight glow on floor from window
  ctx.fillStyle = 'rgba(255,250,220,0.06)';
  ctx.fillRect(o.x + ROOM_W - 90, o.y + wallH, 70, 60);

  // ── Side walls — clean warm tone ──
  const wallColor = '#E8E0D4';
  const wallHighlight = '#F0EAE0';
  const wallShadow = '#D0C8BC';
  // Left wall
  drawRect(ctx, o.x, o.y, wallThick, ROOM_H, wallColor);
  drawRect(ctx, o.x, o.y, 1, ROOM_H, wallShadow);
  drawRect(ctx, o.x + 1, o.y, 1, ROOM_H, wallHighlight);
  // Right wall
  drawRect(ctx, o.x + ROOM_W - wallThick, o.y, wallThick, ROOM_H, wallColor);
  drawRect(ctx, o.x + ROOM_W - 1, o.y, 1, ROOM_H, wallShadow);
  drawRect(ctx, o.x + ROOM_W - 2, o.y, 1, ROOM_H, wallHighlight);

  // Bottom wall with door opening
  const doorW = 36;
  const doorX = o.x + ROOM_W / 2 - doorW / 2;
  drawRect(ctx, o.x, o.y + ROOM_H - wallThick, doorX - o.x, wallThick, wallColor);
  drawRect(ctx, doorX + doorW, o.y + ROOM_H - wallThick, o.x + ROOM_W - doorX - doorW, wallThick, wallColor);
  // Door frame
  drawRect(ctx, doorX - 2, o.y + ROOM_H - wallThick, 2, wallThick, '#8D7B6B');
  drawRect(ctx, doorX + doorW, o.y + ROOM_H - wallThick, 2, wallThick, '#8D7B6B');

  // ── Baseboard — subtle trim ──
  drawRect(ctx, o.x + wallThick, o.y + wallH, ROOM_W - wallThick * 2, 2, '#B8A898');
  drawRect(ctx, o.x + wallThick, o.y + wallH, ROOM_W - wallThick * 2, 1, '#C8B8A8');

  // ── Ceiling light — warm overhead glow ──
  ctx.fillStyle = 'rgba(255,248,230,0.05)';
  ctx.beginPath();
  ctx.ellipse(o.x + ROOM_W / 2, o.y + ROOM_H / 2 + 15, 55, 35, 0, 0, Math.PI * 2);
  ctx.fill();
  // Light fixture
  drawRect(ctx, o.x + ROOM_W / 2 - 12, o.y + 1, 24, 3, '#F5F0E8');
  drawRect(ctx, o.x + ROOM_W / 2 - 8, o.y + 4, 16, 2, '#E8E0D0');

  // ── Nameplate — mounted on the back wall ──
  const plateTxt = `${emoji} ${name}`;
  ctx.font = 'bold 10px sans-serif';
  const tw = ctx.measureText(plateTxt).width;
  const plateX = o.x + 18;
  drawRect(ctx, plateX, o.y + 10, tw + 14, 18, 'rgba(0,0,0,0.2)');
  drawRect(ctx, plateX + 1, o.y + 11, tw + 12, 16, 'rgba(255,255,255,0.12)');
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateTxt, plateX + 7, o.y + 19);

  // ── Area rug under desk ──
  const rugX = o.x + 65, rugY = o.y + 100;
  const rugColor = darken(accent, 15);
  ctx.fillStyle = rugColor;
  ctx.beginPath();
  ctx.roundRect(rugX, rugY, 90, 60, 4);
  ctx.fill();
  ctx.fillStyle = lighten(rugColor, 12);
  ctx.beginPath();
  ctx.roundRect(rugX + 3, rugY + 3, 84, 54, 3);
  ctx.fill();

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

// ─── Break Room ──────────────────────────────────────────────────────────────

function getBreakRoomSeat(agentIndex: number): { x: number; y: number } {
  return BREAK_ROOM_SEATS[agentIndex % BREAK_ROOM_SEATS.length];
}

function getBreakRoomWaypoints(fromRoom: number, seatPos: { x: number; y: number }): { x: number; y: number }[] {
  const door = getDoorPos(fromRoom);
  return aStar(door.x, door.y, seatPos.x, seatPos.y);
}

function getReturnFromBreakWaypoints(toRoom: number, currentX: number, currentY: number): { x: number; y: number }[] {
  const chair = getChairPos(toRoom);
  return aStar(currentX, currentY, chair.x, chair.y);
}

function drawBreakRoom(ctx: CanvasRenderingContext2D, time: number) {
  const bx = BREAK_ROOM_X, by = 0;

  // Floor — warm carpet
  const carpetColors = ['#5A4A3A', '#63523F', '#564435', '#5E4E3D'];
  for (let y = by; y < H; y += 16) {
    for (let x = bx; x < bx + BREAK_ROOM_W; x += 16) {
      const ci = (Math.floor(x / 16) + Math.floor(y / 16)) % carpetColors.length;
      drawRect(ctx, x, y, Math.min(16, bx + BREAK_ROOM_W - x), 16, carpetColors[ci]);
    }
  }

  // Left wall / divider
  const wallX = bx - 4;
  drawRect(ctx, wallX, 0, 4, H, '#D5CCC0');
  drawRect(ctx, wallX + 3, 0, 1, H, '#E8E0D4');

  // "BREAK ROOM" sign — vertical banner on the wall
  ctx.save();
  ctx.font = 'bold 11px monospace';
  const signText = '☕ BREAK ROOM';
  const signW = ctx.measureText(signText).width;
  drawRect(ctx, bx + 8, 15, signW + 12, 18, 'rgba(0,0,0,0.2)');
  drawRect(ctx, bx + 9, 16, signW + 10, 16, 'rgba(255,255,255,0.1)');
  ctx.fillStyle = '#FFF8E1';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(signText, bx + 14, 24);
  ctx.restore();

  // Couch (top area)
  const couchX = bx + 20, couchY = 60;
  drawRect(ctx, couchX, couchY + 8, 80, 16, '#6A1B9A');
  drawRect(ctx, couchX, couchY, 80, 10, '#4A148C');
  drawRect(ctx, couchX + 2, couchY + 2, 76, 6, '#6A1B9A');
  drawRect(ctx, couchX - 2, couchY + 2, 4, 20, '#4A148C');
  drawRect(ctx, couchX + 78, couchY + 2, 4, 20, '#4A148C');
  for (let i = 0; i < 3; i++) {
    drawRect(ctx, couchX + 3 + i * 25, couchY + 9, 23, 13, '#7B1FA2');
    drawRect(ctx, couchX + 4 + i * 25, couchY + 10, 21, 1, lighten('#7B1FA2', 20));
  }

  // Coffee table
  const ctX = bx + 90, ctY = 130;
  drawRect(ctx, ctX + 2, ctY + 8, 46, 3, 'rgba(0,0,0,0.1)');
  drawRect(ctx, ctX + 2, ctY + 5, 2, 5, '#5D4037');
  drawRect(ctx, ctX + 42, ctY + 5, 2, 5, '#5D4037');
  drawRect(ctx, ctX, ctY + 3, 46, 3, '#795548');
  drawRect(ctx, ctX + 1, ctY + 3, 44, 1, '#8D6E63');
  drawRect(ctx, ctX + 10, ctY, 5, 4, '#ECEFF1');
  drawRect(ctx, ctX + 11, ctY + 1, 3, 2, '#6D4C41');
  drawRect(ctx, ctX + 30, ctY, 5, 4, '#ECEFF1');
  drawRect(ctx, ctX + 31, ctY + 1, 3, 2, '#6D4C41');

  // Accent rug (middle area)
  const rugX = bx + 30, rugY = 250;
  ctx.fillStyle = '#7B1FA2';
  ctx.beginPath();
  ctx.roundRect(rugX, rugY, 200, 100, 5);
  ctx.fill();
  ctx.fillStyle = '#9C27B0';
  ctx.beginPath();
  ctx.roundRect(rugX + 4, rugY + 4, 192, 92, 4);
  ctx.fill();
  // Diamond pattern
  for (let i = 0; i < 5; i++) {
    const dx = rugX + 25 + i * 38;
    const dy = rugY + 45;
    drawRect(ctx, dx, dy - 3, 3, 1, '#CE93D8');
    drawRect(ctx, dx - 1, dy - 2, 5, 1, '#CE93D8');
    drawRect(ctx, dx - 2, dy - 1, 7, 1, '#CE93D8');
    drawRect(ctx, dx - 1, dy, 5, 1, '#CE93D8');
    drawRect(ctx, dx, dy + 1, 3, 1, '#CE93D8');
  }

  // Couch (lower area)
  const couch2X = bx + 20, couch2Y = 380;
  drawRect(ctx, couch2X, couch2Y + 8, 80, 16, '#6A1B9A');
  drawRect(ctx, couch2X, couch2Y, 80, 10, '#4A148C');
  drawRect(ctx, couch2X + 2, couch2Y + 2, 76, 6, '#6A1B9A');
  drawRect(ctx, couch2X - 2, couch2Y + 2, 4, 20, '#4A148C');
  drawRect(ctx, couch2X + 78, couch2Y + 2, 4, 20, '#4A148C');
  for (let i = 0; i < 3; i++) {
    drawRect(ctx, couch2X + 3 + i * 25, couch2Y + 9, 23, 13, '#7B1FA2');
  }

  // Coffee machine
  const cmX = bx + 30, cmY = 500;
  drawRect(ctx, cmX, cmY, 24, 30, '#455A64');
  drawRect(ctx, cmX + 1, cmY + 1, 22, 28, '#546E7A');
  drawRect(ctx, cmX + 3, cmY + 3, 18, 10, '#263238');
  drawRect(ctx, cmX + 5, cmY + 15, 3, 3, '#4CAF50');
  drawRect(ctx, cmX + 10, cmY + 15, 3, 3, '#F44336');
  drawRect(ctx, cmX + 6, cmY + 20, 12, 8, '#37474F');
  drawRect(ctx, cmX + 8, cmY + 22, 8, 5, '#263238');
  drawRect(ctx, cmX + 9, cmY + 23, 6, 4, '#ECEFF1');
  // Steam
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const phase of [0, 2.1, 4.2]) {
    const t = (time * 0.002 + phase) % 3;
    if (t < 2) {
      const sy = cmY - 2 - t * 6;
      const sx = cmX + 11 + Math.sin(t * 3 + phase) * 2;
      ctx.globalAlpha = 0.3 * (1 - t / 2);
      ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // Vending machine
  const vmX = bx + 80, vmY = 500;
  drawRect(ctx, vmX, vmY, 30, 40, '#1565C0');
  drawRect(ctx, vmX + 1, vmY + 1, 28, 38, '#1976D2');
  drawRect(ctx, vmX + 3, vmY + 3, 24, 20, '#0D47A1');
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const color = ['#F44336', '#FFC107', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#8BC34A'][(r * 3 + c) % 9];
      drawRect(ctx, vmX + 5 + c * 7, vmY + 5 + r * 6, 5, 4, color);
    }
  }
  drawRect(ctx, vmX + 3, vmY + 25, 24, 12, '#0D47A1');
  ctx.fillStyle = 'rgba(33,150,243,0.05)';
  ctx.fillRect(vmX - 3, vmY - 3, 36, 46);

  // Plants
  drawPlant(ctx, bx + 15, 160);
  drawPlant(ctx, bx + BREAK_ROOM_W - 25, 160);
  drawPlant(ctx, bx + 15, 460);
  drawPlant(ctx, bx + BREAK_ROOM_W - 25, 600);

  // Potted tree
  const ptX = bx + BREAK_ROOM_W - 50, ptY = 50;
  drawRect(ctx, ptX, ptY + 16, 12, 10, '#D84315');
  drawRect(ctx, ptX - 1, ptY + 15, 14, 2, '#BF360C');
  drawRect(ctx, ptX + 1, ptY + 8, 10, 8, '#2E7D32');
  drawRect(ctx, ptX - 2, ptY + 4, 8, 8, '#388E3C');
  drawRect(ctx, ptX + 6, ptY + 2, 8, 8, '#43A047');
  drawRect(ctx, ptX + 2, ptY - 2, 8, 6, '#1B5E20');
  drawRect(ctx, ptX + 4, ptY - 4, 4, 4, '#2E7D32');

  // Wall art
  const posterX = bx + 100, posterY = 10;
  drawRect(ctx, posterX, posterY, 30, 22, '#37474F');
  drawRect(ctx, posterX + 2, posterY + 2, 26, 18, '#263238');
  drawRect(ctx, posterX + 4, posterY + 4, 22, 14, '#1a1a2e');
  ctx.fillStyle = '#7C4DFF';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RELAX', posterX + 15, posterY + 12);

  // Second poster lower
  const p2X = bx + 160, p2Y = 470;
  drawRect(ctx, p2X, p2Y, 30, 22, '#37474F');
  drawRect(ctx, p2X + 2, p2Y + 2, 26, 18, '#263238');
  drawRect(ctx, p2X + 4, p2Y + 4, 22, 14, '#1a1a2e');
  ctx.fillStyle = '#00BCD4';
  ctx.fillText('CHILL', p2X + 15, p2Y + 12);
}

// Draw corridor tiles — polished floor with subtle pattern and lighting
function drawCorridorTiles(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number) {
  const tileA = '#C4BDB5';
  const tileB = '#B8B0A8';
  const tileSize = 20;
  // Base
  ctx.fillStyle = tileA;
  ctx.fillRect(rx, ry, rw, rh);
  // Checkerboard tiles
  for (let x = rx; x < rx + rw; x += tileSize) {
    for (let y = ry; y < ry + rh; y += tileSize) {
      if ((Math.floor((x - rx) / tileSize) + Math.floor((y - ry) / tileSize)) % 2 === 0) {
        drawRect(ctx, x, y, Math.min(tileSize, rx + rw - x), Math.min(tileSize, ry + rh - y), tileB);
      }
      // Tile grout
      drawRect(ctx, x, y, Math.min(tileSize, rx + rw - x), 1, 'rgba(0,0,0,0.04)');
      drawRect(ctx, x, y, 1, Math.min(tileSize, ry + rh - y), 'rgba(0,0,0,0.04)');
    }
  }
  // Center guide line (like real office corridors)
  ctx.fillStyle = 'rgba(139,92,246,0.08)';
  if (rw > rh) {
    ctx.fillRect(rx, ry + rh / 2 - 1, rw, 2);
  } else {
    ctx.fillRect(rx + rw / 2 - 1, ry, 2, rh);
  }
  // Edge shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  if (rw > rh) {
    ctx.fillRect(rx, ry, rw, 2);
    ctx.fillRect(rx, ry + rh - 2, rw, 2);
  } else {
    ctx.fillRect(rx, ry, 2, rh);
    ctx.fillRect(rx + rw - 2, ry, 2, rh);
  }
}

function drawCorridors(ctx: CanvasRenderingContext2D) {
  // Horizontal corridors (extend to break room)
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = (row + 1) * ROOM_H + row * CORRIDOR;
    drawCorridorTiles(ctx, 0, cy, BREAK_ROOM_X, CORRIDOR);
  }
  // Vertical corridors between office columns
  for (let col = 0; col < COLS - 1; col++) {
    const cx = (col + 1) * ROOM_W + col * CORRIDOR;
    drawCorridorTiles(ctx, cx, 0, CORRIDOR, GRID_H);
  }
  // Break room corridor (vertical, right of grid)
  drawCorridorTiles(ctx, GRID_W, 0, CORRIDOR, H);
}

// ─── Character drawing (same as original) ───────────────────────────────────
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
  avatarImg: HTMLImageElement | null;
  avatarLoaded: boolean;
  avatarUrl: string | undefined;
}

const VISITOR_SHIRT_COLORS = ['#2196F3','#FF9800','#4CAF50','#E91E63','#9C27B0','#00BCD4','#FF5722','#607D8B'];
const VISITOR_SKIN_COLORS = ['#FFCC80','#D4A574','#FFE0BD','#C68642','#8D5524','#F1C27D'];

function drawVisitorCharacter(ctx: CanvasRenderingContext2D, v: VisitorAnim, time: number) {
  const { x, y, shirtColor, skinColor, isWalking, walkFrame, bobOffset, avatarImg, avatarLoaded } = v;
  const baseY = y + Math.floor(bobOffset);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x - 4, y + 20, 12, 3);

  const legOffset = isWalking ? [[-1, 1], [1, -1], [1, -1], [-1, 1]][walkFrame % 4] : [0, 0];

  // Legs (jeans blue to differentiate from agents)
  drawRect(ctx, x - 2, baseY + 14, 3, 6 + legOffset[0], '#1a5276');
  drawRect(ctx, x + 3, baseY + 14, 3, 6 + legOffset[1], '#1a5276');
  // Shoes
  drawRect(ctx, x - 3, baseY + 19 + legOffset[0], 4, 2, '#2c3e50');
  drawRect(ctx, x + 2, baseY + 19 + legOffset[1], 4, 2, '#2c3e50');

  // Body / shirt
  drawRect(ctx, x - 3, baseY + 6, 10, 9, shirtColor);
  drawRect(ctx, x - 2, baseY + 7, 8, 1, lighten(shirtColor, 25));

  // Arms
  drawRect(ctx, x - 5, baseY + 7, 3, 6, shirtColor);
  drawRect(ctx, x + 6, baseY + 7, 3, 6, shirtColor);
  // Hands
  drawRect(ctx, x - 5, baseY + 12, 3, 2, skinColor);
  drawRect(ctx, x + 6, baseY + 12, 3, 2, skinColor);

  // Head
  if (avatarLoaded && avatarImg) {
    // Draw Slack avatar as head (circular crop effect via clipping)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 2, baseY + 1, 6, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarImg, x - 4, baseY - 5, 12, 12);
    ctx.restore();
    // Border around avatar
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x + 2, baseY + 1, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Default pixel head with different shape (rounder, no hair — distinguishes from agents)
    drawRect(ctx, x - 3, baseY - 2, 10, 9, skinColor);
    drawRect(ctx, x - 2, baseY - 1, 8, 7, lighten(skinColor, 15));
    // Eyes
    drawRect(ctx, x - 1, baseY + 2, 2, 2, '#1a1a2e');
    drawRect(ctx, x + 3, baseY + 2, 2, 2, '#1a1a2e');
    // Smile
    drawRect(ctx, x, baseY + 5, 4, 1, darken(skinColor, 30));
    // Simple cap (to differentiate from agents)
    drawRect(ctx, x - 4, baseY - 3, 12, 3, shirtColor);
    drawRect(ctx, x - 3, baseY - 4, 10, 2, darken(shirtColor, 20));
  }

  // Slack/surface badge icon above head
  const badgeColor = v.surface === 'slack' ? '#4A154B' : '#2196F3';
  drawRect(ctx, x - 1, baseY - 10, 6, 6, badgeColor);
  drawRect(ctx, x, baseY - 9, 4, 4, lighten(badgeColor, 40));
  // "S" or "W" letter
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 5px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(v.surface === 'slack' ? 'S' : 'W', x + 2, baseY - 5);
}

function drawCharacter(ctx: CanvasRenderingContext2D, agent: AgentAnim, time: number) {
  const { x, y, shirtColor, hairColor, hairStyle, isWalking, walkFrame, bobOffset, state, errorTimer } = agent;
  const baseY = y + Math.floor(bobOffset);
  let jumpY = 0;
  if (state === 'error' && errorTimer > 0) {
    jumpY = -Math.abs(Math.sin(errorTimer * 0.15)) * 4;
  }
  const dy = baseY + jumpY;

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x - 4, y + 20, 12, 3);

  const legOffset = isWalking ? [[-1, 1], [1, -1], [1, -1], [-1, 1]][walkFrame % 4] : [0, 0];

  drawRect(ctx, x - 2, dy + 14, 3, 6 + legOffset[0], '#3b3b5c');
  drawRect(ctx, x + 3, dy + 14, 3, 6 + legOffset[1], '#3b3b5c');
  drawRect(ctx, x - 3, dy + 19 + legOffset[0], 4, 2, '#1a1a2e');
  drawRect(ctx, x + 2, dy + 19 + legOffset[1], 4, 2, '#1a1a2e');

  drawRect(ctx, x - 3, dy + 6, 10, 9, shirtColor);
  drawRect(ctx, x - 2, dy + 7, 8, 1, lighten(shirtColor, 20));

  const armAnim = ACTIVE_STATES.has(state) ? Math.sin(time * 0.008) * 2 : 0;
  drawRect(ctx, x - 5, dy + 7 + Math.floor(armAnim), 3, 6, shirtColor);
  drawRect(ctx, x + 6, dy + 7 - Math.floor(armAnim), 3, 6, shirtColor);
  drawRect(ctx, x - 5, dy + 12 + Math.floor(armAnim), 3, 2, '#FFCC80');
  drawRect(ctx, x + 6, dy + 12 - Math.floor(armAnim), 3, 2, '#FFCC80');

  drawRect(ctx, x - 3, dy - 2, 10, 9, '#FFCC80');
  drawRect(ctx, x - 2, dy - 1, 8, 7, '#FFD699');
  drawRect(ctx, x - 1, dy + 2, 2, 2, '#1a1a2e');
  drawRect(ctx, x + 3, dy + 2, 2, 2, '#1a1a2e');
  drawRect(ctx, x - 1, dy + 2, 1, 1, '#444');
  drawRect(ctx, x + 3, dy + 2, 1, 1, '#444');

  if (state === 'error') {
    drawRect(ctx, x + 1, dy + 5, 2, 1, '#C62828');
  } else {
    drawRect(ctx, x, dy + 5, 4, 1, '#BF8B5E');
  }

  switch (hairStyle) {
    case 0:
      drawRect(ctx, x - 3, dy - 4, 10, 3, hairColor);
      drawRect(ctx, x - 3, dy - 2, 2, 3, hairColor);
      drawRect(ctx, x + 5, dy - 2, 2, 3, hairColor);
      break;
    case 1:
      drawRect(ctx, x - 4, dy - 5, 12, 4, hairColor);
      drawRect(ctx, x - 4, dy - 2, 2, 5, hairColor);
      drawRect(ctx, x + 6, dy - 2, 2, 5, hairColor);
      drawRect(ctx, x - 2, dy - 1, 4, 2, hairColor);
      break;
    case 2:
      drawRect(ctx, x - 2, dy - 8, 8, 7, hairColor);
      drawRect(ctx, x, dy - 9, 4, 2, hairColor);
      break;
    case 3:
      drawRect(ctx, x - 3, dy - 5, 10, 4, hairColor);
      drawRect(ctx, x - 4, dy - 6, 3, 2, hairColor);
      drawRect(ctx, x + 1, dy - 7, 3, 2, hairColor);
      drawRect(ctx, x + 5, dy - 6, 3, 2, hairColor);
      break;
  }

  if (state === 'error') {
    drawRect(ctx, x + 1, dy - 14, 2, 6, '#ef4444');
    drawRect(ctx, x + 1, dy - 7, 2, 2, '#ef4444');
  }

  if (agent.hovered) {
    ctx.fillStyle = hexToRgba(STATE_COLORS[state] || '#fff', 0.12);
    ctx.fillRect(x - 8, dy - 12, 20, 36);
  }
}

// ─── Thought bubbles from monitors ──────────────────────────────────────────
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
  const lineH = 12;
  const padding = 6;
  ctx.font = 'bold 10px monospace';
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

  // Fade in effect based on time
  const alpha = Math.min(1, (time % 10000) / 500);
  ctx.globalAlpha = alpha;

  // Trailing circles (thought bubble style)
  const circlePositions = [
    { x: monitorX, y: monitorY - 4, r: 2 },
    { x: monitorX - 3, y: monitorY - 10, r: 3 },
    { x: monitorX - 5, y: monitorY - 17 + bobY * 0.5, r: 4 },
  ];
  for (const c of circlePositions) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(Math.floor(c.x), Math.floor(c.y), c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cloud bubble
  const r = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.fill();

  // Inner lighter fill
  ctx.fillStyle = lighten(color, 15);
  ctx.fillRect(Math.floor(bx + 2), Math.floor(by + 2), bw - 4, bh - 4);

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], Math.floor(bx + padding), Math.floor(by + padding + i * lineH));
  }

  ctx.globalAlpha = 1;
}

// ─── Speech bubbles for chat (pointed tail style) ──────────────────────────
function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  const lines = wrapText(text, 30);
  const lineH = 10;
  const padding = 5;
  ctx.font = 'bold 8px monospace';
  let maxW = 0;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  const bw = Math.max(maxW + padding * 2, 30);
  const bh = lines.length * lineH + padding * 2;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(y - bh - 8);

  // Bubble body
  drawRect(ctx, bx, by, bw, bh, color);
  drawRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, lighten(color, 15));

  // Pointed tail (triangle)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 4, by + bh);
  ctx.lineTo(x, by + bh + 6);
  ctx.lineTo(x + 4, by + bh);
  ctx.fill();

  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], Math.floor(bx + padding), Math.floor(by + padding + i * lineH));
  }
}

// ─── Minimap ────────────────────────────────────────────────────────────────
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
        // Walk off screen to the left
        v.waypoints = [{ x: -30, y: v.y }];
        v.waypointIndex = 0;
        v.targetX = v.waypoints[0].x;
        v.targetY = v.waypoints[0].y;
      }
    }

    // Add or update visitors
    for (const sv of visitors) {
      const prev = existing.get(sv.id);
      // Find the agent index for this visitor's target
      const agentIdx = agents.findIndex(a => a.label === sv.targetAgent);
      const targetRoom = agentIdx >= 0 ? agentIdx : 0;

      if (prev) {
        prev.targetAgentLabel = sv.targetAgent;
        prev.targetRoomIndex = targetRoom;
        prev.name = sv.name;
        // Load avatar if URL changed
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

      // New visitor — spawn at left edge of canvas, walk to agent's room
      const h = hashStr(sv.id);
      const entryY = 100 + (h % (H - 200));
      const chairPos = getChairPos(targetRoom);

      const newVisitor: VisitorAnim = {
        id: sv.id, name: sv.name, surface: sv.surface || 'slack',
        x: -20, y: entryY,
        targetX: -20, targetY: entryY,
        shirtColor: VISITOR_SHIRT_COLORS[h % VISITOR_SHIRT_COLORS.length],
        skinColor: VISITOR_SKIN_COLORS[(h >> 3) % VISITOR_SKIN_COLORS.length],
        walkFrame: 0, walkTimer: 0, isWalking: false,
        bobOffset: 0, bobTimer: Math.random() * Math.PI * 2,
        targetAgentLabel: sv.targetAgent,
        targetRoomIndex: targetRoom,
        chatState: 'entering',
        waypoints: [],
        waypointIndex: 0,
        avatarImg: null, avatarLoaded: false, avatarUrl: sv.avatarUrl,
      };

      // Build path: enter via a horizontal corridor, then walk to agent's room
      const targetRow = Math.floor(targetRoom / COLS);
      const targetCol = targetRoom % COLS;
      const door = getDoorPos(targetRoom);
      // Enter on the corridor closest to the target room
      const entryCorridorRow = targetRow < ROWS - 1 ? targetRow : targetRow - 1;
      const corridorCenterY = hCorridorY(entryCorridorRow);
      newVisitor.waypoints = [
        { x: 0, y: corridorCenterY },                  // Enter from left edge on corridor
        { x: door.x, y: corridorCenterY },             // Walk along corridor to door
        { x: door.x, y: door.y },                      // Enter through door
        { x: chairPos.x + 25, y: chairPos.y + 10 },   // Stand near agent
      ];
      newVisitor.waypointIndex = 0;
      newVisitor.targetX = newVisitor.waypoints[0].x;
      newVisitor.targetY = newVisitor.waypoints[0].y;

      // Load avatar image if available
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
        // Don't change target unless state actually changed
        // In break room? Keep break room position. At desk? Keep desk position.
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
            // Walk home
            a.chatState = 'walking_home';
            const homeChair = getChairPos(a.roomIndex);
            a.waypoints = getCorridorWaypoints(a.chatTarget, a.roomIndex);
            a.waypoints.push(homeChair);
            a.waypointIndex = 0;
            a.targetX = a.waypoints[0].x;
            a.targetY = a.waypoints[0].y;
          } else if (a.chatState === 'walking_to_chat') {
            // Abort, walk home
            a.chatState = 'walking_home';
            const homeChair = getChairPos(a.roomIndex);
            a.waypoints = [homeChair];
            a.waypointIndex = 0;
            a.targetX = homeChair.x;
            a.targetY = homeChair.y;
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

        // Lower index stays, higher index visits
        const stayer = a1.roomIndex < a2.roomIndex ? a1 : a2;
        const visitor = a1.roomIndex < a2.roomIndex ? a2 : a1;

        if (visitor.conversationId === conv.id) continue; // Already handling
        if (visitor.chatState !== 'at_desk') continue; // Busy

        // Start the visitor walking
        visitor.conversationId = conv.id;
        visitor.chatState = 'walking_to_chat';
        visitor.chatTarget = stayer.roomIndex;
        visitor.waypoints = getCorridorWaypoints(visitor.roomIndex, stayer.roomIndex);
        // Final position: near the stayer
        const stayerChair = getChairPos(stayer.roomIndex);
        visitor.waypoints.push({ x: stayerChair.x + 20, y: stayerChair.y + 10 });
        visitor.waypointIndex = 0;
        visitor.targetX = visitor.waypoints[0].x;
        visitor.targetY = visitor.waypoints[0].y;
        visitor.chatMessageIndex = 0;
        visitor.chatTimer = 0;

        // Mark stayer too
        stayer.conversationId = conv.id;
        stayer.chatMessageIndex = 0;
        stayer.chatTimer = 0;
      }

      // ─── Idle agents → break room, active agents → back to desk ───
      for (const a of anim.agents) {
        const isIdle = a.state === 'idle';
        const isBusy = ACTIVE_STATES.has(a.state) || a.state === 'error';

        // Only trigger transitions when state ACTUALLY changed (not every frame)
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
          // Only from in_break_room — not walking_to_break (let them finish walking first)
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
      const WALK_SPEED = 1.6; // pixels per frame, consistent pace
      const CORNER_RADIUS = 12; // start turning this many px before a waypoint

      for (const a of anim.agents) {
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          a.isWalking = true;

          // Check if we're approaching a corner — if next waypoint exists and
          // changes direction, start curving toward it early
          const isTransit = a.chatState === 'walking_to_chat' || a.chatState === 'walking_home'
            || a.chatState === 'walking_to_break' || a.chatState === 'walking_from_break';
          let moveX = (dx / dist) * WALK_SPEED;
          let moveY = (dy / dist) * WALK_SPEED;

          if (isTransit && dist < CORNER_RADIUS && a.waypointIndex < a.waypoints.length - 1) {
            // Approaching a waypoint with more to go — blend toward next waypoint
            const nextWp = a.waypoints[a.waypointIndex + 1];
            if (nextWp) {
              const ndx = nextWp.x - a.targetX;
              const ndy = nextWp.y - a.targetY;
              const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
              if (ndist > 0) {
                // Blend factor: 0 at CORNER_RADIUS, 1 at waypoint
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

          // Walk animation frame
          a.walkTimer += dt;
          if (a.walkTimer > 120) {
            a.walkFrame = (a.walkFrame + 1) % 4;
            a.walkTimer = 0;
          }
        } else {
          a.isWalking = false;
          a.x = a.targetX;
          a.y = a.targetY;

          // Waypoint progression
          const isTransit = a.chatState === 'walking_to_chat' || a.chatState === 'walking_home'
            || a.chatState === 'walking_to_break' || a.chatState === 'walking_from_break';
          if (isTransit && a.waypoints.length > 0) {
            a.waypointIndex++;
            if (a.waypointIndex < a.waypoints.length) {
              a.targetX = a.waypoints[a.waypointIndex].x;
              a.targetY = a.waypoints[a.waypointIndex].y;
            } else {
              // Arrived at destination
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
                // walking_home
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

        if (dist > 1) {
          v.isWalking = true;

          // Corner rounding — blend toward next waypoint when close to current
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

          // Waypoint progression
          if (v.waypoints.length > 0 && v.waypointIndex < v.waypoints.length - 1) {
            v.waypointIndex++;
            v.targetX = v.waypoints[v.waypointIndex].x;
            v.targetY = v.waypoints[v.waypointIndex].y;
          } else if (v.chatState === 'entering' || v.chatState === 'walking_to_agent') {
            v.chatState = 'chatting';
            v.waypoints = [];
          }
        }

        v.bobTimer += dt * 0.003;
        v.bobOffset = Math.sin(v.bobTimer) * 1.0;
      }

      // ─── Draw ───
      if (!canvas) return;
      // Use virtual dimensions (transform already applied by resize handler)
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Background
      ctx.fillStyle = '#E8E0D4';
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
          // Empty room
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

        // Name label (always visible when hovered or when not in corridor)
        if (agent.hovered || agent.chatState === 'at_desk') {
          drawPixelText(ctx, `${agent.emoji} ${agent.name}`, agent.x + 2, agent.y + 22, '#fff', 8);
        }
      }

      // ─── Draw visitors ───
      const sortedVisitors = [...anim.visitors].sort((a, b) => a.y - b.y);
      for (const v of sortedVisitors) {
        drawVisitorCharacter(ctx, v, timestamp);

        // Name label
        const badgeIcon = v.surface === 'slack' ? '#' : '@';
        drawPixelText(ctx, `${badgeIcon}${v.name}`, v.x + 2, v.y + 22, '#81D4FA', 7);

        // Speech bubble when chatting
        if (v.chatState === 'chatting') {
          const bubbleText = `Hey ${v.targetAgentLabel}!`;
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
      // Scale to fit container width, maintain aspect ratio
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
    <div ref={containerRef} className={`w-full relative ${isFullscreen ? 'bg-[#E8E0D4]' : ''}`}>
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

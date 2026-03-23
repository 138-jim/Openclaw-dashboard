'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { AgentState, STATE_COLORS, hashStr } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';

// ─── Layout Constants ────────────────────────────────────────────────────────
const ROOM_W = 220, ROOM_H = 200;
const CORRIDOR = 40;
const COLS = 4, ROWS = 4;
const GRID_W = COLS * ROOM_W + (COLS - 1) * CORRIDOR;  // 1000
const GRID_H = ROWS * ROOM_H + (ROWS - 1) * CORRIDOR;  // 920

// Break room below the grid
const BREAK_ROOM_H = 180;
const BREAK_ROOM_Y = GRID_H + CORRIDOR; // corridor gap then break room
const W = GRID_W;
const H = BREAK_ROOM_Y + BREAK_ROOM_H;

const ACTIVE_STATES = new Set(['writing', 'researching', 'executing', 'syncing']);

// Break room seating positions (agents lounge here when idle)
const BREAK_ROOM_SEATS = [
  { x: 80, y: BREAK_ROOM_Y + 60 },
  { x: 160, y: BREAK_ROOM_Y + 90 },
  { x: 240, y: BREAK_ROOM_Y + 55 },
  { x: 320, y: BREAK_ROOM_Y + 85 },
  { x: 400, y: BREAK_ROOM_Y + 60 },
  { x: 480, y: BREAK_ROOM_Y + 90 },
  { x: 560, y: BREAK_ROOM_Y + 55 },
  { x: 640, y: BREAK_ROOM_Y + 85 },
  { x: 720, y: BREAK_ROOM_Y + 60 },
  { x: 800, y: BREAK_ROOM_Y + 90 },
  { x: 130, y: BREAK_ROOM_Y + 130 },
  { x: 270, y: BREAK_ROOM_Y + 130 },
  { x: 410, y: BREAK_ROOM_Y + 130 },
  { x: 550, y: BREAK_ROOM_Y + 130 },
  { x: 690, y: BREAK_ROOM_Y + 130 },
  { x: 830, y: BREAK_ROOM_Y + 130 },
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

// Corridor waypoints for pathfinding between rooms
function getCorridorWaypoints(fromRoom: number, toRoom: number): { x: number; y: number }[] {
  const fromDoor = getDoorPos(fromRoom);
  const toDoor = getDoorPos(toRoom);
  const fromCol = fromRoom % COLS;
  const fromRow = Math.floor(fromRoom / COLS);
  const toCol = toRoom % COLS;
  const toRow = Math.floor(toRoom / COLS);

  const waypoints: { x: number; y: number }[] = [];

  // Step outside own door
  waypoints.push({ x: fromDoor.x, y: fromDoor.y + CORRIDOR / 2 });

  // Horizontal corridor (below fromRow)
  const corridorYFrom = fromDoor.y + CORRIDOR / 2;
  const corridorYTo = toDoor.y + CORRIDOR / 2;

  if (fromRow === toRow) {
    // Same row - just walk horizontally
    waypoints.push({ x: toDoor.x, y: corridorYFrom });
  } else {
    // Need vertical movement
    // Walk to vertical corridor intersection
    const vertCorridorX = Math.min(fromCol, toCol) * (ROOM_W + CORRIDOR) + ROOM_W + CORRIDOR / 2;
    waypoints.push({ x: vertCorridorX, y: corridorYFrom });
    waypoints.push({ x: vertCorridorX, y: corridorYTo });
    waypoints.push({ x: toDoor.x, y: corridorYTo });
  }

  // Step into target door
  waypoints.push({ x: toDoor.x, y: toDoor.y });

  return waypoints;
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
];

function drawRoom(ctx: CanvasRenderingContext2D, roomIndex: number, label: string, name: string, emoji: string, glowColor: string | undefined, isError: boolean, time: number) {
  const o = getRoomOrigin(roomIndex);
  const wallH = 36;
  const accent = ACCENT_WALLS[roomIndex % ACCENT_WALLS.length];

  // ── Floor: light wood herringbone ──
  const plankW = 16, plankH = 8;
  for (let y = o.y + wallH; y < o.y + ROOM_H; y += plankH) {
    for (let x = o.x + 4; x < o.x + ROOM_W - 4; x += plankW) {
      const ci = (Math.floor(x / plankW) * 3 + Math.floor(y / plankH) * 7) % FLOOR_COLORS.length;
      const w = Math.min(plankW, o.x + ROOM_W - 4 - x);
      drawRect(ctx, x, y, w, plankH, FLOOR_COLORS[ci]);
      drawRect(ctx, x, y + plankH - 1, w, 1, darken(FLOOR_COLORS[ci], 12));
    }
  }

  // Error red floor glow
  if (isError) {
    const pulse = 0.06 + Math.sin(time * 0.002) * 0.03;
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.fillRect(o.x + 4, o.y + wallH, ROOM_W - 8, ROOM_H - wallH);
  }

  // ── Walls: clean painted with accent back wall ──
  // Back wall (top) — colored accent
  drawRect(ctx, o.x, o.y, ROOM_W, wallH, accent);
  // Subtle gradient on accent wall
  const grd = ctx.createLinearGradient(o.x, o.y, o.x, o.y + wallH);
  grd.addColorStop(0, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grd;
  ctx.fillRect(o.x, o.y, ROOM_W, wallH);

  // Side walls — soft warm white
  const wallColor = '#E8E0D4';
  const wallShadow = '#D5CCC0';
  drawRect(ctx, o.x, o.y, 4, ROOM_H, wallColor);
  drawRect(ctx, o.x, o.y, 1, ROOM_H, wallShadow);
  drawRect(ctx, o.x + ROOM_W - 4, o.y, 4, ROOM_H, wallColor);
  drawRect(ctx, o.x + ROOM_W - 1, o.y, 1, ROOM_H, wallShadow);

  // Bottom wall with door opening
  const doorW = 34;
  const doorX = o.x + ROOM_W / 2 - doorW / 2;
  drawRect(ctx, o.x, o.y + ROOM_H - 4, doorX - o.x, 4, wallColor);
  drawRect(ctx, doorX + doorW, o.y + ROOM_H - 4, o.x + ROOM_W - doorX - doorW, 4, wallColor);
  // Door frame highlight
  drawRect(ctx, doorX - 1, o.y + ROOM_H - 4, 1, 4, '#B8A898');
  drawRect(ctx, doorX + doorW, o.y + ROOM_H - 4, 1, 4, '#B8A898');

  // Baseboard — thin elegant
  drawRect(ctx, o.x + 4, o.y + wallH, ROOM_W - 8, 2, '#C4B5A5');

  // ── Ceiling light (warm glow on floor) ──
  ctx.fillStyle = 'rgba(255,245,220,0.04)';
  ctx.beginPath();
  ctx.ellipse(o.x + ROOM_W / 2, o.y + ROOM_H / 2 + 20, 60, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  // Light fixture on ceiling
  drawRect(ctx, o.x + ROOM_W / 2 - 8, o.y + 2, 16, 3, '#F5F0E8');
  drawRect(ctx, o.x + ROOM_W / 2 - 5, o.y + 5, 10, 2, '#E8E0D0');

  // ── Nameplate: modern frosted glass style ──
  const plateTxt = `${emoji} ${name}`;
  ctx.font = 'bold 10px sans-serif';
  const tw = ctx.measureText(plateTxt).width;
  const plateX = o.x + ROOM_W / 2 - tw / 2 - 6;
  // Frosted glass plate
  drawRect(ctx, plateX, o.y + 10, tw + 12, 16, 'rgba(255,255,255,0.15)');
  drawRect(ctx, plateX + 1, o.y + 11, tw + 10, 14, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateTxt, o.x + ROOM_W / 2, o.y + 18);

  // ── Small rug under desk area ──
  const rugX = o.x + 70, rugY = o.y + 110;
  const rugColor = darken(accent, 20);
  drawRect(ctx, rugX, rugY, 80, 50, rugColor);
  drawRect(ctx, rugX + 2, rugY + 2, 76, 46, lighten(rugColor, 10));
  drawRect(ctx, rugX + 4, rugY + 4, 72, 42, rugColor);

  // Desk + chair
  const deskPos = getDeskPos(roomIndex);
  drawDesk(ctx, deskPos.x - 10, deskPos.y - 30, glowColor);
  const chairPos = getChairPos(roomIndex);
  drawChair(ctx, chairPos.x - 6, chairPos.y - 12);

  // Decorations
  const [dec1, dec2] = getRoomDecorations(label);
  drawDecoration(ctx, dec1, o.x + 15, o.y + 130, time);
  drawDecoration(ctx, dec2, o.x + ROOM_W - 55, o.y + 45, time);
}

// ─── Break Room ──────────────────────────────────────────────────────────────

function getBreakRoomSeat(agentIndex: number): { x: number; y: number } {
  return BREAK_ROOM_SEATS[agentIndex % BREAK_ROOM_SEATS.length];
}

function getBreakRoomWaypoints(fromRoom: number): { x: number; y: number }[] {
  const door = getDoorPos(fromRoom);
  const corridorY = door.y + CORRIDOR / 2;
  // Walk out of room, down the corridor to the break room entrance
  return [
    { x: door.x, y: corridorY },
    { x: door.x, y: BREAK_ROOM_Y - 5 },
  ];
}

function getReturnFromBreakWaypoints(toRoom: number, currentX: number, currentY: number): { x: number; y: number }[] {
  const door = getDoorPos(toRoom);
  return [
    { x: currentX, y: BREAK_ROOM_Y - 5 },
    { x: door.x, y: BREAK_ROOM_Y - 5 },
    { x: door.x, y: door.y + CORRIDOR / 2 },
    { x: door.x, y: door.y },
  ];
}

function drawBreakRoom(ctx: CanvasRenderingContext2D, time: number) {
  const bx = 0, by = BREAK_ROOM_Y;

  // Floor — warm carpet tiles
  const carpetColors = ['#4A3728', '#523F30', '#463425', '#4E3B2D'];
  for (let y = by; y < by + BREAK_ROOM_H; y += 16) {
    for (let x = bx; x < W; x += 16) {
      const ci = (Math.floor(x / 16) + Math.floor(y / 16)) % carpetColors.length;
      drawRect(ctx, x, y, 16, 16, carpetColors[ci]);
    }
  }

  // Accent rug in center
  const rugX = W / 2 - 100, rugY = by + 50;
  drawRect(ctx, rugX, rugY, 200, 80, '#7B1FA2');
  drawRect(ctx, rugX + 3, rugY + 3, 194, 74, '#9C27B0');
  drawRect(ctx, rugX + 6, rugY + 6, 188, 68, '#8E24AA');
  // Diamond pattern
  for (let i = 0; i < 7; i++) {
    const dx = rugX + 20 + i * 26;
    const dy = rugY + 35;
    drawRect(ctx, dx, dy - 3, 3, 1, '#CE93D8');
    drawRect(ctx, dx - 1, dy - 2, 5, 1, '#CE93D8');
    drawRect(ctx, dx - 2, dy - 1, 7, 1, '#CE93D8');
    drawRect(ctx, dx - 1, dy, 5, 1, '#CE93D8');
    drawRect(ctx, dx, dy + 1, 3, 1, '#CE93D8');
  }

  // Top wall / divider
  drawRect(ctx, bx, by - 4, W, 4, '#5D4E37');
  drawRect(ctx, bx, by - 1, W, 1, '#6E5C43');

  // "BREAK ROOM" sign on divider
  ctx.font = 'bold 11px monospace';
  const signText = '☕ BREAK ROOM';
  const signW = ctx.measureText(signText).width;
  const signX = W / 2 - signW / 2 - 6;
  drawRect(ctx, signX, by - 18, signW + 12, 16, '#5D4037');
  drawRect(ctx, signX + 1, by - 17, signW + 10, 14, '#795548');
  ctx.fillStyle = '#FFF8E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(signText, W / 2, by - 10);

  // Couch (left side)
  const couchX = 30, couchY = by + 40;
  drawRect(ctx, couchX, couchY + 8, 80, 16, '#6A1B9A');
  drawRect(ctx, couchX, couchY, 80, 10, '#4A148C');
  drawRect(ctx, couchX + 2, couchY + 2, 76, 6, '#6A1B9A');
  drawRect(ctx, couchX - 2, couchY + 2, 4, 20, '#4A148C');
  drawRect(ctx, couchX + 78, couchY + 2, 4, 20, '#4A148C');
  for (let i = 0; i < 3; i++) {
    drawRect(ctx, couchX + 3 + i * 25, couchY + 9, 23, 13, '#7B1FA2');
    drawRect(ctx, couchX + 4 + i * 25, couchY + 10, 21, 1, lighten('#7B1FA2', 20));
  }

  // Couch (right side)
  const couchX2 = W - 110, couchY2 = by + 40;
  drawRect(ctx, couchX2, couchY2 + 8, 80, 16, '#6A1B9A');
  drawRect(ctx, couchX2, couchY2, 80, 10, '#4A148C');
  drawRect(ctx, couchX2 + 2, couchY2 + 2, 76, 6, '#6A1B9A');
  drawRect(ctx, couchX2 - 2, couchY2 + 2, 4, 20, '#4A148C');
  drawRect(ctx, couchX2 + 78, couchY2 + 2, 4, 20, '#4A148C');
  for (let i = 0; i < 3; i++) {
    drawRect(ctx, couchX2 + 3 + i * 25, couchY2 + 9, 23, 13, '#7B1FA2');
  }

  // Coffee table (center)
  const ctX = W / 2 - 25, ctY = by + 80;
  drawRect(ctx, ctX + 2, ctY + 8, 46, 3, 'rgba(0,0,0,0.1)');
  drawRect(ctx, ctX + 2, ctY + 5, 2, 5, '#5D4037');
  drawRect(ctx, ctX + 42, ctY + 5, 2, 5, '#5D4037');
  drawRect(ctx, ctX, ctY + 3, 46, 3, '#795548');
  drawRect(ctx, ctX + 1, ctY + 3, 44, 1, '#8D6E63');
  // Coffee cups
  drawRect(ctx, ctX + 10, ctY, 5, 4, '#ECEFF1');
  drawRect(ctx, ctX + 11, ctY + 1, 3, 2, '#6D4C41');
  drawRect(ctx, ctX + 30, ctY, 5, 4, '#ECEFF1');
  drawRect(ctx, ctX + 31, ctY + 1, 3, 2, '#6D4C41');

  // Coffee machine (left wall area)
  const cmX = 140, cmY = by + 15;
  drawRect(ctx, cmX, cmY, 24, 30, '#455A64');
  drawRect(ctx, cmX + 1, cmY + 1, 22, 28, '#546E7A');
  drawRect(ctx, cmX + 3, cmY + 3, 18, 10, '#263238');
  drawRect(ctx, cmX + 5, cmY + 15, 3, 3, '#4CAF50');
  drawRect(ctx, cmX + 10, cmY + 15, 3, 3, '#F44336');
  drawRect(ctx, cmX + 6, cmY + 20, 12, 8, '#37474F');
  drawRect(ctx, cmX + 8, cmY + 22, 8, 5, '#263238');
  drawRect(ctx, cmX + 9, cmY + 23, 6, 4, '#ECEFF1');
  // Steam
  const steamPhases = [0, 2.1, 4.2];
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (const phase of steamPhases) {
    const t = (time * 0.002 + phase) % 3;
    if (t < 2) {
      const sy = cmY - 2 - t * 6;
      const sx = cmX + 11 + Math.sin(t * 3 + phase) * 2;
      ctx.globalAlpha = 0.3 * (1 - t / 2);
      ctx.fillRect(Math.floor(sx), Math.floor(sy), 2, 2);
    }
  }
  ctx.globalAlpha = 1;

  // Vending machine (right area)
  const vmX = W - 60, vmY = by + 10;
  drawRect(ctx, vmX, vmY, 30, 40, '#1565C0');
  drawRect(ctx, vmX + 1, vmY + 1, 28, 38, '#1976D2');
  drawRect(ctx, vmX + 3, vmY + 3, 24, 20, '#0D47A1');
  // Drink slots
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const color = ['#F44336', '#FFC107', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#8BC34A'][(r * 3 + c) % 9];
      drawRect(ctx, vmX + 5 + c * 7, vmY + 5 + r * 6, 5, 4, color);
    }
  }
  drawRect(ctx, vmX + 3, vmY + 25, 24, 12, '#0D47A1');
  // Glow
  ctx.fillStyle = 'rgba(33,150,243,0.05)';
  ctx.fillRect(vmX - 3, vmY - 3, 36, 46);

  // Plants scattered around
  drawPlant(ctx, 20, by + 140);
  drawPlant(ctx, W - 30, by + 140);
  drawPlant(ctx, W / 2 - 80, by + 140);
  drawPlant(ctx, W / 2 + 70, by + 140);

  // Potted tree (larger plant)
  const ptX = W / 2 + 180, ptY = by + 20;
  drawRect(ctx, ptX, ptY + 16, 12, 10, '#D84315');
  drawRect(ctx, ptX - 1, ptY + 15, 14, 2, '#BF360C');
  drawRect(ctx, ptX + 1, ptY + 8, 10, 8, '#2E7D32');
  drawRect(ctx, ptX - 2, ptY + 4, 8, 8, '#388E3C');
  drawRect(ctx, ptX + 6, ptY + 2, 8, 8, '#43A047');
  drawRect(ctx, ptX + 2, ptY - 2, 8, 6, '#1B5E20');
  drawRect(ctx, ptX + 4, ptY - 4, 4, 4, '#2E7D32');

  // Wall art / poster
  const posterX = W / 2 - 15, posterY = by + 8;
  drawRect(ctx, posterX, posterY, 30, 22, '#37474F');
  drawRect(ctx, posterX + 2, posterY + 2, 26, 18, '#263238');
  drawRect(ctx, posterX + 4, posterY + 4, 22, 14, '#1a1a2e');
  // "CHILL" text on poster
  ctx.fillStyle = '#7C4DFF';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RELAX', W / 2, posterY + 12);
}

// Draw corridors — modern polished concrete with subtle pattern
function drawCorridorTiles(ctx: CanvasRenderingContext2D, rx: number, ry: number, rw: number, rh: number) {
  const tileA = '#B8B0A8';
  const tileB = '#ADA5A0';
  const tileSize = 20;
  // Base fill
  ctx.fillStyle = tileA;
  ctx.fillRect(rx, ry, rw, rh);
  // Checkerboard
  for (let x = rx; x < rx + rw; x += tileSize) {
    for (let y = ry; y < ry + rh; y += tileSize) {
      if ((Math.floor((x - rx) / tileSize) + Math.floor((y - ry) / tileSize)) % 2 === 0) {
        drawRect(ctx, x, y, Math.min(tileSize, rx + rw - x), Math.min(tileSize, ry + rh - y), tileB);
      }
    }
  }
  // Subtle center line
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  if (rw > rh) {
    ctx.fillRect(rx, ry + rh / 2 - 1, rw, 2);
  } else {
    ctx.fillRect(rx + rw / 2 - 1, ry, 2, rh);
  }
}

function drawCorridors(ctx: CanvasRenderingContext2D) {
  // Horizontal corridors
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = (row + 1) * ROOM_H + row * CORRIDOR;
    drawCorridorTiles(ctx, 0, cy, W, CORRIDOR);
  }
  // Vertical corridors
  for (let col = 0; col < COLS - 1; col++) {
    const cx = (col + 1) * ROOM_W + col * CORRIDOR;
    drawCorridorTiles(ctx, cx, 0, CORRIDOR, GRID_H);
  }
  // Break room corridor
  drawCorridorTiles(ctx, 0, GRID_H, W, CORRIDOR);
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
function drawMinimap(ctx: CanvasRenderingContext2D, agents: AgentAnim[], panX: number, panY: number, zoom: number, canvasW: number, canvasH: number) {
  const mmW = 120, mmH = 90;
  const mmX = canvasW - mmW - 10;
  const mmY = canvasH - mmH - 10;
  const scaleX = mmW / W;
  const scaleY = mmH / H;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(mmX, mmY, mmW, mmH);

  // Room outlines
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const o = getRoomOrigin(i);
    ctx.strokeRect(mmX + o.x * scaleX, mmY + o.y * scaleY, ROOM_W * scaleX, ROOM_H * scaleY);
  }

  // Agent dots
  for (const a of agents) {
    ctx.fillStyle = STATE_COLORS[a.state] || '#64748b';
    const dx = mmX + a.x * scaleX;
    const dy = mmY + a.y * scaleY;
    ctx.fillRect(dx - 1, dy - 1, 3, 3);
  }

  // Viewport rectangle
  const vpX = mmX + (-panX / zoom) * scaleX;
  const vpY = mmY + (-panY / zoom) * scaleY;
  const vpW = (canvasW / zoom) * scaleX;
  const vpH = (canvasH / zoom) * scaleY;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpX, vpY, vpW, vpH);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PixelOffice({ agents, conversations = [], visitors = [] }: { agents: AgentState[]; conversations?: Conversation[]; visitors?: SlackVisitor[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<{
    agents: AgentAnim[];
    visitors: VisitorAnim[];
    mouseX: number;
    mouseY: number;
    time: number;
    frameId: number;
    panX: number;
    panY: number;
    zoom: number;
    isPanning: boolean;
    panStartX: number;
    panStartY: number;
    panStartPanX: number;
    panStartPanY: number;
    conversations: Conversation[];
  }>({
    agents: [],
    visitors: [],
    mouseX: -999,
    mouseY: -999,
    time: 0,
    frameId: 0,
    panX: 0,
    panY: 0,
    zoom: 1,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
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

      // Build path: entry point → corridor → agent's room
      const roomOrigin = getRoomOrigin(targetRoom);
      const doorX = roomOrigin.x + ROOM_W / 2;
      const doorY = roomOrigin.y + ROOM_H;
      newVisitor.waypoints = [
        { x: 0, y: entryY },                        // Enter from left
        { x: doorX, y: entryY },                     // Walk horizontally
        { x: doorX, y: doorY },                      // Walk to room door
        { x: chairPos.x + 25, y: chairPos.y + 10 },  // Stand near agent
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
        return {
          ...prev,
          name: a.name,
          emoji: a.emoji,
          state: a.state,
          detail: a.detail,
          // Only update target if at_desk or in_break_room (not mid-transit)
          targetX: (prev.chatState === 'at_desk' || prev.chatState === 'in_break_room') ? chairPos.x : prev.targetX,
          targetY: (prev.chatState === 'at_desk' || prev.chatState === 'in_break_room') ? chairPos.y : prev.targetY,
          isWalking: stateChanged ? true : prev.isWalking,
          errorTimer: a.state === 'error' ? (prev.errorTimer || 100) : 0,
          roomIndex: i,
        };
      }

      return {
        label: a.label, name: a.name, emoji: a.emoji,
        state: a.state, detail: a.detail,
        x: chairPos.x, y: chairPos.y,
        targetX: chairPos.x, targetY: chairPos.y,
        shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
        hairColor: HAIR_COLORS[(h >> 4) % HAIR_COLORS.length],
        hairStyle: HAIR_STYLES[(h >> 8) % HAIR_STYLES.length],
        walkFrame: 0, walkTimer: 0, isWalking: false,
        bobOffset: 0, bobTimer: Math.random() * Math.PI * 2,
        errorTimer: a.state === 'error' ? 100 : 0,
        hovered: false,
        roomIndex: i,
        chatState: 'at_desk' as const,
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

  // Pan/zoom event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const anim = animRef.current;
    anim.isPanning = true;
    anim.panStartX = e.clientX;
    anim.panStartY = e.clientY;
    anim.panStartPanX = anim.panX;
    anim.panStartPanY = anim.panY;
  }, []);

  const handleMouseUp = useCallback(() => {
    animRef.current.isPanning = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const anim = animRef.current;
    const rect = canvas.getBoundingClientRect();

    if (anim.isPanning) {
      const dx = e.clientX - anim.panStartX;
      const dy = e.clientY - anim.panStartY;
      anim.panX = anim.panStartPanX + dx;
      anim.panY = anim.panStartPanY + dy;
    }

    // Track mouse in world coordinates for hover
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    anim.mouseX = (screenX - anim.panX) / anim.zoom;
    anim.mouseY = (screenY - anim.panY) / anim.zoom;
  }, []);

  const handleMouseLeave = useCallback(() => {
    animRef.current.mouseX = -999;
    animRef.current.mouseY = -999;
    animRef.current.isPanning = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const anim = animRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Mouse position in virtual coords
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);

    const oldZoom = anim.zoom;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    anim.zoom = Math.max(0.5, Math.min(2, anim.zoom * delta));

    // Adjust pan to zoom towards mouse
    anim.panX = mx - (mx - anim.panX) * (anim.zoom / oldZoom);
    anim.panY = my - (my - anim.panY) * (anim.zoom / oldZoom);
  }, []);

  const handleDoubleClick = useCallback(() => {
    const anim = animRef.current;
    anim.panX = 0;
    anim.panY = 0;
    anim.zoom = 1;
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

        if (isIdle && a.chatState === 'at_desk' && !a.conversationId) {
          // Send idle agent to break room
          a.chatState = 'walking_to_break';
          const seat = getBreakRoomSeat(a.roomIndex);
          const waypoints = getBreakRoomWaypoints(a.roomIndex);
          waypoints.push(seat);
          a.waypoints = waypoints;
          a.waypointIndex = 0;
          a.targetX = a.waypoints[0].x;
          a.targetY = a.waypoints[0].y;
        } else if (isBusy && (a.chatState === 'in_break_room' || a.chatState === 'walking_to_break')) {
          // Agent became active — walk back to desk
          a.chatState = 'walking_from_break';
          const homeChair = getChairPos(a.roomIndex);
          const waypoints = getReturnFromBreakWaypoints(a.roomIndex, a.x, a.y);
          waypoints.push(homeChair);
          a.waypoints = waypoints;
          a.waypointIndex = 0;
          a.targetX = a.waypoints[0].x;
          a.targetY = a.waypoints[0].y;
        }
      }

      // ─── Update agents ───
      for (const a of anim.agents) {
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
          a.isWalking = true;
          const speed = Math.min(2, dist * 0.04);
          a.x += (dx / dist) * speed;
          a.y += (dy / dist) * speed;
          a.walkTimer += dt;
          if (a.walkTimer > 150) {
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
      for (const v of anim.visitors) {
        const dx = v.targetX - v.x;
        const dy = v.targetY - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2) {
          v.isWalking = true;
          const speed = Math.min(1.8, dist * 0.03);
          v.x += (dx / dist) * speed;
          v.y += (dy / dist) * speed;
          v.walkTimer += dt;
          if (v.walkTimer > 160) {
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

      // Dark background behind everything
      ctx.fillStyle = '#E8E0D4';
      ctx.fillRect(0, 0, W, H);

      // Apply pan/zoom transform
      ctx.save();
      ctx.translate(anim.panX, anim.panY);
      ctx.scale(anim.zoom, anim.zoom);

      // Draw corridors first (behind rooms)
      drawCorridors(ctx);

      // Draw break room
      drawBreakRoom(ctx, timestamp);

      // Draw rooms
      for (let i = 0; i < 16; i++) {
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

      ctx.restore();

      // ─── UI Overlays (not affected by pan/zoom) ───
      drawMinimap(ctx, anim.agents, anim.panX, anim.panY, anim.zoom, W, H);

      anim.frameId = requestAnimationFrame(render);
    }

    animRef.current.frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current.frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handler — render at 2x for crisp text at any zoom
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = container.clientWidth;
      const displayScale = Math.min(cw / W, 1);
      const displayW = W * displayScale;
      const displayH = H * displayScale;
      canvas.width = Math.floor(displayW * dpr);
      canvas.height = Math.floor(displayH * dpr);
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr * displayScale, dpr * displayScale);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: 'grab' }}
        className="border border-gray-700 rounded-lg shadow-2xl"
      />
    </div>
  );
}

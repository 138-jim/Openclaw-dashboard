'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { AgentState, STATE_COLORS, hashStr } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';

// ─── Layout Constants ────────────────────────────────────────────────────────
const ROOM_W = 220, ROOM_H = 200;
const CORRIDOR = 40;
const COLS = 4, ROWS = 4;
const W = COLS * ROOM_W + (COLS - 1) * CORRIDOR;  // 4*220 + 3*40 = 1000
const H = ROWS * ROOM_H + (ROWS - 1) * CORRIDOR;  // 4*200 + 3*40 = 920

const ACTIVE_STATES = new Set(['writing', 'researching', 'executing', 'syncing']);

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
const FLOOR_COLORS = ['#b8864e','#c4915a','#a87d47','#d4a06a','#be8f55'];
const STONE_COLORS = ['#8B8682','#9E9A96','#7D7975','#928E8A','#858178'];

function drawRoom(ctx: CanvasRenderingContext2D, roomIndex: number, label: string, name: string, emoji: string, glowColor: string | undefined, isError: boolean, time: number) {
  const o = getRoomOrigin(roomIndex);

  const plankW = 32, plankH = 12;
  for (let y = o.y + 30; y < o.y + ROOM_H; y += plankH) {
    const rowOff = ((y - o.y) / plankH) % 2 === 0 ? 0 : plankW / 2;
    for (let x = o.x; x < o.x + ROOM_W; x += plankW) {
      const px = x + rowOff;
      const ci = (Math.floor(px / plankW) * 7 + Math.floor(y / plankH) * 13) % FLOOR_COLORS.length;
      const base = FLOOR_COLORS[ci];
      ctx.fillStyle = base;
      ctx.fillRect(Math.max(o.x, Math.floor(px)), Math.floor(y), Math.min(plankW, o.x + ROOM_W - Math.floor(px)), plankH);
      // Grain
      const seed = (Math.floor(px / plankW) * 31 + Math.floor(y / plankH) * 17);
      for (let g = 0; g < 2; g++) {
        const gx = px + 3 + ((seed + g * 11) % (plankW - 6));
        const gy = y + 1 + (g * 3) % (plankH - 2);
        if (gx >= o.x && gx < o.x + ROOM_W) {
          drawRect(ctx, gx, gy, Math.min(6, o.x + ROOM_W - gx), 1, darken(base, 15));
        }
      }
    }
  }

  // Error red floor glow
  if (isError) {
    const pulse = 0.06 + Math.sin(time * 0.002) * 0.03;
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.fillRect(o.x, o.y + 30, ROOM_W, ROOM_H - 30);
  }

  const brickW = 24, brickH = 12;

  // Top wall
  for (let y = o.y; y < o.y + 30; y += brickH) {
    const offset = ((y - o.y) / brickH) % 2 === 0 ? 0 : brickW / 2;
    for (let x = o.x; x < o.x + ROOM_W; x += brickW) {
      const bx = x + offset;
      const ci = (Math.floor((bx + 999) / brickW) * 3 + Math.floor(y / brickH) * 7) % STONE_COLORS.length;
      const clipped = Math.min(brickW, o.x + ROOM_W - bx);
      if (clipped > 0 && bx >= o.x - brickW) {
        drawRect(ctx, Math.max(o.x, bx), y, Math.min(clipped, brickW), brickH, STONE_COLORS[ci]);
        drawRect(ctx, Math.max(o.x, bx), y + brickH - 1, Math.min(clipped, brickW), 1, '#6B6765');
      }
    }
  }

  // Left wall strip
  drawRect(ctx, o.x, o.y, 6, ROOM_H, '#7D7975');
  drawRect(ctx, o.x, o.y, 1, ROOM_H, '#6B6765');

  // Right wall strip
  drawRect(ctx, o.x + ROOM_W - 6, o.y, 6, ROOM_H, '#7D7975');
  drawRect(ctx, o.x + ROOM_W - 1, o.y, 1, ROOM_H, '#6B6765');

  // Bottom wall with door opening
  const doorW = 30;
  const doorX = o.x + ROOM_W / 2 - doorW / 2;
  drawRect(ctx, o.x, o.y + ROOM_H - 6, doorX - o.x, 6, '#7D7975');
  drawRect(ctx, doorX + doorW, o.y + ROOM_H - 6, o.x + ROOM_W - doorX - doorW, 6, '#7D7975');

  // Baseboard
  drawRect(ctx, o.x + 6, o.y + 30, ROOM_W - 12, 3, '#5D4E37');
  drawRect(ctx, o.x + 6, o.y + 30, ROOM_W - 12, 1, '#6E5C43');

  // Nameplate on top wall
  const plateTxt = `${emoji} ${name}`;
  ctx.font = 'bold 9px monospace';
  const tw = ctx.measureText(plateTxt).width;
  const plateX = o.x + ROOM_W / 2 - tw / 2 - 4;
  drawRect(ctx, plateX, o.y + 8, tw + 8, 14, '#5D4037');
  drawRect(ctx, plateX + 1, o.y + 9, tw + 6, 12, '#795548');
  ctx.fillStyle = '#FFFDE7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateTxt, o.x + ROOM_W / 2, o.y + 15);

  // Desk + chair
  const deskPos = getDeskPos(roomIndex);
  drawDesk(ctx, deskPos.x - 10, deskPos.y - 30, glowColor);
  const chairPos = getChairPos(roomIndex);
  drawChair(ctx, chairPos.x - 6, chairPos.y - 12);

  // Decorations
  const [dec1, dec2] = getRoomDecorations(label);
  // Place dec1 on left side, dec2 on right side of room
  drawDecoration(ctx, dec1, o.x + 15, o.y + 130, time);
  drawDecoration(ctx, dec2, o.x + ROOM_W - 55, o.y + 45, time);
}

// Draw corridors
function drawCorridors(ctx: CanvasRenderingContext2D) {
  const corridorColor = '#6B6358';
  const corridorDark = '#5A534A';

  // Horizontal corridors (between rows)
  for (let row = 0; row < ROWS - 1; row++) {
    const cy = (row + 1) * ROOM_H + row * CORRIDOR;
    ctx.fillStyle = corridorColor;
    ctx.fillRect(0, cy, W, CORRIDOR);
    // Tile pattern
    for (let x = 0; x < W; x += 20) {
      for (let y = cy; y < cy + CORRIDOR; y += 20) {
        if ((Math.floor(x / 20) + Math.floor((y - cy) / 20)) % 2 === 0) {
          drawRect(ctx, x, y, 20, 20, corridorDark);
        }
      }
    }
  }

  // Vertical corridors (between columns)
  for (let col = 0; col < COLS - 1; col++) {
    const cx = (col + 1) * ROOM_W + col * CORRIDOR;
    ctx.fillStyle = corridorColor;
    ctx.fillRect(cx, 0, CORRIDOR, H);
    for (let x = cx; x < cx + CORRIDOR; x += 20) {
      for (let y = 0; y < H; y += 20) {
        if ((Math.floor((x - cx) / 20) + Math.floor(y / 20)) % 2 === 0) {
          drawRect(ctx, x, y, 20, 20, corridorDark);
        }
      }
    }
  }
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
  chatState: 'at_desk' | 'walking_to_chat' | 'chatting' | 'walking_home';
  chatTarget: number; // room index of chat partner
  waypoints: { x: number; y: number }[];
  waypointIndex: number;
  chatMessageIndex: number;
  chatTimer: number;
  conversationId: string | null;
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

export default function PixelOffice({ agents, conversations = [] }: { agents: AgentState[]; conversations?: Conversation[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<{
    agents: AgentAnim[];
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
          // Only update target if at_desk (not mid-chat)
          targetX: prev.chatState === 'at_desk' ? chairPos.x : prev.targetX,
          targetY: prev.chatState === 'at_desk' ? chairPos.y : prev.targetY,
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Mouse position on canvas
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

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
    ctx.imageSmoothingEnabled = false;

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
          if ((a.chatState === 'walking_to_chat' || a.chatState === 'walking_home') && a.waypoints.length > 0) {
            a.waypointIndex++;
            if (a.waypointIndex < a.waypoints.length) {
              a.targetX = a.waypoints[a.waypointIndex].x;
              a.targetY = a.waypoints[a.waypointIndex].y;
            } else {
              // Arrived
              if (a.chatState === 'walking_to_chat') {
                a.chatState = 'chatting';
                a.chatTimer = 0;
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

      // ─── Draw ───
      if (!canvas) return;
      const cw = canvas.width;
      const ch = canvas.height;
      ctx.clearRect(0, 0, cw, ch);

      // Dark background behind everything
      ctx.fillStyle = '#0a0a15';
      ctx.fillRect(0, 0, cw, ch);

      // Apply pan/zoom transform
      ctx.save();
      ctx.translate(anim.panX, anim.panY);
      ctx.scale(anim.zoom, anim.zoom);

      // Draw corridors first (behind rooms)
      drawCorridors(ctx);

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

      ctx.restore();

      // ─── UI Overlays (not affected by pan/zoom) ───
      drawMinimap(ctx, anim.agents, anim.panX, anim.panY, anim.zoom, cw, ch);

      anim.frameId = requestAnimationFrame(render);
    }

    animRef.current.frameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current.frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const cw = container.clientWidth;
      const scale = Math.min(cw / W, 1);
      canvas.style.width = `${W * scale}px`;
      canvas.style.height = `${H * scale}px`;
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        style={{ imageRendering: 'pixelated', cursor: 'grab' }}
        className="border border-gray-700 rounded-lg shadow-2xl"
      />
    </div>
  );
}

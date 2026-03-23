'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { AgentState, STATE_COLORS } from '@/lib/agents';

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 960, H = 540;
const WALL_H = 160, FLOOR_Y = WALL_H + 8; // 8px baseboard
const ZONE_W = W / 3;

// Agent color palettes derived from name hash
const SHIRT_COLORS = [
  '#e74c3c','#3498db','#2ecc71','#9b59b6','#e67e22',
  '#1abc9c','#e84393','#0984e3','#6c5ce7','#00b894',
  '#fdcb6e','#fab1a0','#74b9ff','#a29bfe','#ff7675','#55efc4'
];
const HAIR_COLORS = ['#2c1810','#8B4513','#DAA520','#1a1a2e','#C0392B','#5D4037','#212121','#D4A574'];
const HAIR_STYLES = [0,1,2,3]; // short, medium, tall, spiky

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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

// ─── Zone positions for each state ──────────────────────────────────────────
function getZoneForState(state: string): number {
  switch(state) {
    case 'writing': case 'researching': case 'executing': case 'syncing': return 0; // work
    case 'idle': return 1; // lounge
    case 'error': return 2; // debug
    default: return 1;
  }
}

// Desk positions in work zone
const DESK_POSITIONS = [
  { x: 40, y: 240 }, { x: 140, y: 240 }, { x: 240, y: 240 },
  { x: 40, y: 340 }, { x: 140, y: 340 }, { x: 240, y: 340 },
];

// Lounge seating positions
const LOUNGE_POSITIONS = [
  { x: 380, y: 300 }, { x: 430, y: 330 }, { x: 480, y: 300 },
  { x: 530, y: 330 }, { x: 580, y: 300 }, { x: 420, y: 370 },
];

// Debug zone positions
const DEBUG_POSITIONS = [
  { x: 700, y: 260 }, { x: 770, y: 300 }, { x: 840, y: 260 },
  { x: 700, y: 370 }, { x: 770, y: 400 }, { x: 840, y: 370 },
];

function getTargetPos(state: string, index: number): { x: number; y: number } {
  const zone = getZoneForState(state);
  const positions = [DESK_POSITIONS, LOUNGE_POSITIONS, DEBUG_POSITIONS][zone];
  const pos = positions[index % positions.length];
  return { x: pos.x, y: pos.y };
}

// ─── Internal agent state for animation ─────────────────────────────────────
interface AgentAnim {
  label: string; name: string; emoji: string; state: string; detail: string;
  x: number; y: number; targetX: number; targetY: number;
  shirtColor: string; hairColor: string; hairStyle: number;
  walkFrame: number; walkTimer: number; isWalking: boolean;
  bobOffset: number; bobTimer: number;
  errorTimer: number;
  hovered: boolean;
}

// ─── Particle ───────────────────────────────────────────────────────────────
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number; }

// ─── LED ────────────────────────────────────────────────────────────────────
interface LED { x: number; y: number; color: string; rate: number; phase: number; }

// ─── Drawing helpers ────────────────────────────────────────────────────────
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), w, h);
}

// ─── Scene drawing functions ────────────────────────────────────────────────

function drawWoodFloor(ctx: CanvasRenderingContext2D, time: number) {
  const baseColors = ['#b8864e','#c4915a','#a87d47','#d4a06a','#be8f55'];
  const plankW = 32, plankH = 12;
  
  for (let y = FLOOR_Y; y < H; y += plankH) {
    const rowOffset = ((y - FLOOR_Y) / plankH) % 2 === 0 ? 0 : plankW / 2;
    for (let x = -plankW; x < W + plankW; x += plankW) {
      const px = x + rowOffset;
      const ci = (Math.floor(px / plankW) * 7 + Math.floor(y / plankH) * 13) % baseColors.length;
      const base = baseColors[ci];
      drawRect(ctx, px, y, plankW, plankH, base);
      
      // Wood grain lines
      const grainSeed = (Math.floor(px / plankW) * 31 + Math.floor(y / plankH) * 17);
      for (let g = 0; g < 3; g++) {
        const gx = px + 3 + ((grainSeed + g * 11) % (plankW - 6));
        const gy = y + 1 + (g * 3) % (plankH - 2);
        const gl = 4 + (grainSeed + g) % 8;
        drawRect(ctx, gx, gy, gl, 1, darken(base, 15));
      }
      
      // Plank borders
      drawRect(ctx, px, y, plankW, 1, darken(base, 25));
      drawRect(ctx, px, y, 1, plankH, darken(base, 20));
    }
  }
}

function drawWalls(ctx: CanvasRenderingContext2D) {
  // Stone wall
  const stoneColors = ['#8B8682','#9E9A96','#7D7975','#928E8A','#858178'];
  const brickW = 24, brickH = 12;
  
  for (let y = 0; y < WALL_H; y += brickH) {
    const offset = (y / brickH) % 2 === 0 ? 0 : brickW / 2;
    for (let x = -brickW; x < W + brickW; x += brickW) {
      const bx = x + offset;
      const ci = (Math.floor((bx + 999) / brickW) * 3 + Math.floor(y / brickH) * 7) % stoneColors.length;
      drawRect(ctx, bx, y, brickW, brickH, stoneColors[ci]);
      // Mortar lines
      drawRect(ctx, bx, y + brickH - 1, brickW, 1, '#6B6765');
      drawRect(ctx, bx, y, 1, brickH, '#6B6765');
      // Highlight on top edge
      drawRect(ctx, bx + 1, y, brickW - 2, 1, lighten(stoneColors[ci], 15));
    }
  }
  
  // Baseboard
  drawRect(ctx, 0, WALL_H, W, 4, '#5D4E37');
  drawRect(ctx, 0, WALL_H + 4, W, 4, '#4A3D2C');
  drawRect(ctx, 0, WALL_H, W, 1, '#6E5C43');
}

function drawFramedPicture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Frame
  drawRect(ctx, x, y, 30, 24, '#5D4037');
  drawRect(ctx, x + 1, y + 1, 28, 22, '#6D4C41');
  // Canvas inside
  drawRect(ctx, x + 3, y + 3, 24, 18, '#E8D5B7');
  // Simple landscape: sky + hills + sun
  drawRect(ctx, x + 3, y + 3, 24, 9, '#87CEEB');
  drawRect(ctx, x + 3, y + 12, 24, 9, '#4CAF50');
  // Sun
  drawRect(ctx, x + 20, y + 5, 4, 4, '#FFD700');
  // Hill
  for (let i = 0; i < 8; i++) {
    drawRect(ctx, x + 7 + i, y + 10 - Math.floor(Math.abs(i - 4) * 0.5), 1, 2, '#388E3C');
  }
}

function drawClock(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number) {
  const now = new Date();
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  
  // Clock body
  drawRect(ctx, cx - 10, cy - 10, 20, 20, '#F5F5DC');
  drawRect(ctx, cx - 11, cy - 11, 22, 22, '#5D4037');
  drawRect(ctx, cx - 10, cy - 10, 20, 20, '#FFFDE7');
  
  // Clock face dots (hour markers)
  for (let h = 0; h < 12; h++) {
    const angle = (h / 12) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.round(Math.cos(angle) * 7);
    const dy = Math.round(Math.sin(angle) * 7);
    drawRect(ctx, cx + dx, cy + dy, 1, 1, '#333');
  }
  
  // Hour hand
  const hAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const hx = Math.round(cx + Math.cos(hAngle) * i);
    const hy = Math.round(cy + Math.sin(hAngle) * i);
    drawRect(ctx, hx, hy, 1, 1, '#333');
  }
  
  // Minute hand
  const mAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const mx = Math.round(cx + Math.cos(mAngle) * i);
    const my = Math.round(cy + Math.sin(mAngle) * i);
    drawRect(ctx, mx, my, 1, 1, '#666');
  }
  
  // Center dot
  drawRect(ctx, cx, cy, 1, 1, '#C62828');
}

function drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x, y, 50, 32, '#BDBDBD');
  drawRect(ctx, x + 2, y + 2, 46, 28, '#FAFAFA');
  // Scribbles
  for (let i = 0; i < 4; i++) {
    const sy = y + 6 + i * 6;
    const sw = 20 + (i * 7) % 15;
    drawRect(ctx, x + 6, sy, sw, 1, '#1565C0');
  }
  // Red dot
  drawRect(ctx, x + 38, y + 8, 3, 3, '#E53935');
  // Tray
  drawRect(ctx, x + 5, y + 32, 40, 3, '#9E9E9E');
  drawRect(ctx, x + 10, y + 31, 4, 2, '#F44336'); // marker
  drawRect(ctx, x + 16, y + 31, 4, 2, '#2196F3'); // marker
}

// ─── Furniture drawing ──────────────────────────────────────────────────────

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, glowColor?: string) {
  // Shadow
  drawRect(ctx, x + 2, y + 18, 40, 3, 'rgba(0,0,0,0.15)');
  // Legs
  drawRect(ctx, x + 2, y + 12, 2, 8, '#6D4C41');
  drawRect(ctx, x + 36, y + 12, 2, 8, '#6D4C41');
  // Desktop surface
  drawRect(ctx, x, y + 10, 40, 4, '#8D6E63');
  drawRect(ctx, x + 1, y + 10, 38, 1, '#A1887F'); // highlight
  
  // Monitor
  drawRect(ctx, x + 14, y + 1, 14, 10, '#37474F');
  drawRect(ctx, x + 15, y + 2, 12, 7, glowColor || '#263238');
  // Monitor stand
  drawRect(ctx, x + 19, y + 10, 4, 2, '#546E7A');
  
  // Monitor glow
  if (glowColor && glowColor !== '#263238') {
    ctx.fillStyle = hexToRgba(glowColor, 0.08);
    ctx.fillRect(x + 8, y - 2, 26, 18);
  }
  
  // Keyboard
  drawRect(ctx, x + 12, y + 11, 10, 2, '#90A4AE');
  drawRect(ctx, x + 13, y + 11, 8, 1, '#B0BEC5');
}

function drawChair(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Seat
  drawRect(ctx, x, y, 12, 4, '#455A64');
  drawRect(ctx, x + 1, y, 10, 1, '#546E7A');
  // Back
  drawRect(ctx, x + 1, y - 8, 10, 9, '#37474F');
  drawRect(ctx, x + 2, y - 7, 8, 7, '#455A64');
  // Legs
  drawRect(ctx, x + 2, y + 4, 2, 4, '#333');
  drawRect(ctx, x + 8, y + 4, 2, 4, '#333');
  // Wheel
  drawRect(ctx, x + 1, y + 7, 3, 2, '#555');
  drawRect(ctx, x + 8, y + 7, 3, 2, '#555');
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Pot
  drawRect(ctx, x, y + 6, 8, 6, '#D84315');
  drawRect(ctx, x - 1, y + 5, 10, 2, '#BF360C');
  drawRect(ctx, x + 1, y + 7, 6, 1, '#E64A19'); // highlight
  // Soil
  drawRect(ctx, x + 1, y + 5, 6, 1, '#3E2723');
  // Leaves
  drawRect(ctx, x + 2, y + 1, 4, 5, '#2E7D32');
  drawRect(ctx, x, y - 1, 3, 4, '#388E3C');
  drawRect(ctx, x + 5, y, 3, 3, '#43A047');
  drawRect(ctx, x + 3, y - 2, 2, 3, '#1B5E20');
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, on: boolean) {
  // Pole
  drawRect(ctx, x + 3, y, 2, 20, '#757575');
  // Shade
  drawRect(ctx, x - 2, y - 4, 12, 5, on ? '#FFF59D' : '#9E9E9E');
  drawRect(ctx, x - 1, y - 3, 10, 3, on ? '#FFF176' : '#BDBDBD');
  // Light glow
  if (on) {
    ctx.fillStyle = 'rgba(255,245,157,0.06)';
    ctx.beginPath();
    ctx.arc(x + 4, y + 10, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCouch(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const c1 = '#6A1B9A', c2 = '#7B1FA2', c3 = '#4A148C';
  // Shadow
  drawRect(ctx, x + 3, y + 18, 60, 4, 'rgba(0,0,0,0.12)');
  // Base
  drawRect(ctx, x, y + 8, 64, 12, c1);
  // Back
  drawRect(ctx, x, y, 64, 10, c3);
  drawRect(ctx, x + 2, y + 2, 60, 6, c1);
  // Arms
  drawRect(ctx, x - 2, y + 2, 4, 16, c3);
  drawRect(ctx, x + 62, y + 2, 4, 16, c3);
  // Cushions (3)
  for (let i = 0; i < 3; i++) {
    const cx = x + 2 + i * 20;
    drawRect(ctx, cx, y + 9, 19, 9, c2);
    drawRect(ctx, cx + 1, y + 10, 17, 1, lighten(c2, 20));
    // Cushion line
    if (i < 2) drawRect(ctx, cx + 19, y + 9, 1, 9, c3);
  }
  // Highlight on back
  drawRect(ctx, x + 2, y + 2, 60, 1, lighten(c1, 25));
  // Feet
  drawRect(ctx, x + 2, y + 20, 4, 2, '#4E342E');
  drawRect(ctx, x + 58, y + 20, 4, 2, '#4E342E');
}

function drawCoffeeTable(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRect(ctx, x + 2, y + 8, 36, 3, 'rgba(0,0,0,0.1)');
  // Legs
  drawRect(ctx, x + 2, y + 5, 2, 5, '#5D4037');
  drawRect(ctx, x + 32, y + 5, 2, 5, '#5D4037');
  // Top
  drawRect(ctx, x, y + 3, 36, 3, '#795548');
  drawRect(ctx, x + 1, y + 3, 34, 1, '#8D6E63');
  // Coffee cup
  drawRect(ctx, x + 14, y, 6, 4, '#ECEFF1');
  drawRect(ctx, x + 15, y + 1, 4, 2, '#6D4C41');
  drawRect(ctx, x + 20, y + 1, 2, 2, '#ECEFF1'); // handle
}

function drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  // Shadow
  drawRect(ctx, x + 3, y + 28, 22, 3, 'rgba(0,0,0,0.12)');
  // Body
  drawRect(ctx, x, y, 24, 30, '#455A64');
  drawRect(ctx, x + 1, y + 1, 22, 28, '#546E7A');
  // Front panel
  drawRect(ctx, x + 3, y + 3, 18, 10, '#263238');
  // Buttons
  drawRect(ctx, x + 5, y + 15, 3, 3, '#4CAF50');
  drawRect(ctx, x + 10, y + 15, 3, 3, '#F44336');
  drawRect(ctx, x + 15, y + 15, 3, 3, '#FFC107');
  // Drip area
  drawRect(ctx, x + 6, y + 20, 12, 8, '#37474F');
  drawRect(ctx, x + 8, y + 22, 8, 5, '#263238');
  // Cup
  drawRect(ctx, x + 9, y + 23, 6, 4, '#ECEFF1');
  
  // Steam wisps
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
  // Frame
  drawRect(ctx, x, y, 40, 50, '#4E342E');
  drawRect(ctx, x + 2, y + 2, 36, 46, '#5D4037');
  // Shelves (3)
  const bookColors = ['#C62828','#1565C0','#2E7D32','#F9A825','#6A1B9A','#00838F','#EF6C00','#AD1457'];
  for (let s = 0; s < 3; s++) {
    const sy = y + 4 + s * 15;
    drawRect(ctx, x + 2, sy + 12, 36, 2, '#3E2723');
    // Books
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

function drawRug(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Outer border
  drawRect(ctx, x, y, 80, 40, '#B71C1C');
  drawRect(ctx, x + 2, y + 2, 76, 36, '#D32F2F');
  drawRect(ctx, x + 4, y + 4, 72, 32, '#E53935');
  // Inner pattern
  drawRect(ctx, x + 6, y + 6, 68, 28, '#C62828');
  // Diamond pattern
  for (let i = 0; i < 5; i++) {
    const dx = x + 14 + i * 14;
    const dy = y + 16;
    drawRect(ctx, dx, dy - 4, 4, 1, '#FFCDD2');
    drawRect(ctx, dx - 1, dy - 3, 6, 1, '#FFCDD2');
    drawRect(ctx, dx - 2, dy - 2, 8, 1, '#FFCDD2');
    drawRect(ctx, dx - 1, dy - 1, 6, 1, '#FFCDD2');
    drawRect(ctx, dx, dy, 4, 1, '#FFCDD2');
  }
}

function drawServerRack(ctx: CanvasRenderingContext2D, x: number, y: number, leds: LED[], time: number) {
  // Shadow
  drawRect(ctx, x + 3, y + 48, 28, 4, 'rgba(0,0,0,0.15)');
  // Body
  drawRect(ctx, x, y, 30, 50, '#263238');
  drawRect(ctx, x + 1, y + 1, 28, 48, '#37474F');
  // Rack units
  for (let u = 0; u < 5; u++) {
    const uy = y + 3 + u * 9;
    drawRect(ctx, x + 3, uy, 24, 7, '#1a1a2e');
    drawRect(ctx, x + 4, uy + 1, 22, 1, '#2d2d44');
    // Vent holes
    for (let v = 0; v < 4; v++) {
      drawRect(ctx, x + 14 + v * 3, uy + 3, 1, 2, '#111');
    }
  }
  // LEDs
  for (const led of leds) {
    const on = Math.sin(time * led.rate * 0.003 + led.phase) > 0;
    if (on) {
      drawRect(ctx, x + led.x, y + led.y, 2, 2, led.color);
      ctx.fillStyle = hexToRgba(led.color, 0.15);
      ctx.fillRect(x + led.x - 1, y + led.y - 1, 4, 4);
    } else {
      drawRect(ctx, x + led.x, y + led.y, 2, 2, '#1a1a1a');
    }
  }
}

function drawWarningStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  for (let i = 0; i < w; i += 8) {
    drawRect(ctx, x + i, y, 4, 4, '#FFC107');
    drawRect(ctx, x + i + 4, y, 4, 4, '#212121');
  }
}

function drawTerminalDesk(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  drawDesk(ctx, x, y);
  // Override monitor with green screen
  drawRect(ctx, x + 15, y + 2, 12, 7, '#001100');
  // Scanline
  const scanY = y + 2 + (Math.floor(time * 0.01) % 7);
  drawRect(ctx, x + 15, scanY, 12, 1, '#003300');
  // Text cursor blink
  if (Math.sin(time * 0.005) > 0) {
    drawRect(ctx, x + 17, y + 5, 3, 2, '#00FF00');
  }
  // Green glow
  ctx.fillStyle = 'rgba(0,255,0,0.04)';
  ctx.fillRect(x + 8, y - 2, 26, 18);
}

function drawSpiderWeb(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  // Simple radial web
  const lines = 6;
  const r = 18;
  for (let i = 0; i < lines; i++) {
    const angle = (i / lines) * Math.PI / 2; // quarter circle, top-right corner
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - Math.cos(angle) * r, y + Math.sin(angle) * r);
    ctx.stroke();
  }
  // Concentric arcs
  for (let ring = 1; ring <= 3; ring++) {
    const rr = ring * 6;
    ctx.beginPath();
    for (let i = 0; i <= lines; i++) {
      const angle = (Math.min(i, lines - 1) / (lines - 1)) * Math.PI / 2;
      const px = x - Math.cos(angle) * rr;
      const py = y + Math.sin(angle) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // Tiny spider
  drawRect(ctx, x - 10, y + 8, 3, 2, '#333');
  drawRect(ctx, x - 11, y + 7, 1, 1, '#333');
  drawRect(ctx, x - 7, y + 7, 1, 1, '#333');
}

// ─── Character drawing ──────────────────────────────────────────────────────

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  agent: AgentAnim,
  time: number
) {
  const { x, y, shirtColor, hairColor, hairStyle, isWalking, walkFrame, bobOffset, state, errorTimer } = agent;
  const baseY = y + Math.floor(bobOffset);
  
  // Error jump
  let jumpY = 0;
  if (state === 'error' && errorTimer > 0) {
    jumpY = -Math.abs(Math.sin(errorTimer * 0.15)) * 4;
  }
  const dy = baseY + jumpY;
  
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(x - 4, y + 20, 12, 3);
  
  // Walking leg animation
  const legOffset = isWalking ? [[-1, 1], [1, -1], [1, -1], [-1, 1]][walkFrame % 4] : [0, 0];
  
  // Legs
  drawRect(ctx, x - 2, dy + 14, 3, 6 + legOffset[0], '#3b3b5c');
  drawRect(ctx, x + 3, dy + 14, 3, 6 + legOffset[1], '#3b3b5c');
  
  // Shoes
  drawRect(ctx, x - 3, dy + 19 + legOffset[0], 4, 2, '#1a1a2e');
  drawRect(ctx, x + 2, dy + 19 + legOffset[1], 4, 2, '#1a1a2e');
  
  // Body / shirt
  drawRect(ctx, x - 3, dy + 6, 10, 9, shirtColor);
  drawRect(ctx, x - 2, dy + 7, 8, 1, lighten(shirtColor, 20)); // highlight
  
  // Arms
  const armAnim = (state === 'writing' || state === 'researching' || state === 'executing' || state === 'syncing')
    ? Math.sin(time * 0.008) * 2 : 0;
  drawRect(ctx, x - 5, dy + 7 + Math.floor(armAnim), 3, 6, shirtColor);
  drawRect(ctx, x + 6, dy + 7 - Math.floor(armAnim), 3, 6, shirtColor);
  // Hands
  drawRect(ctx, x - 5, dy + 12 + Math.floor(armAnim), 3, 2, '#FFCC80');
  drawRect(ctx, x + 6, dy + 12 - Math.floor(armAnim), 3, 2, '#FFCC80');
  
  // Head (skin)
  drawRect(ctx, x - 3, dy - 2, 10, 9, '#FFCC80');
  drawRect(ctx, x - 2, dy - 1, 8, 7, '#FFD699');
  
  // Eyes
  drawRect(ctx, x - 1, dy + 2, 2, 2, '#1a1a2e');
  drawRect(ctx, x + 3, dy + 2, 2, 2, '#1a1a2e');
  // Eye highlight
  drawRect(ctx, x - 1, dy + 2, 1, 1, '#444');
  drawRect(ctx, x + 3, dy + 2, 1, 1, '#444');
  
  // Mouth
  if (state === 'error') {
    drawRect(ctx, x + 1, dy + 5, 2, 1, '#C62828'); // open mouth
  } else {
    drawRect(ctx, x, dy + 5, 4, 1, '#BF8B5E');
  }
  
  // Hair
  switch (hairStyle) {
    case 0: // short
      drawRect(ctx, x - 3, dy - 4, 10, 3, hairColor);
      drawRect(ctx, x - 3, dy - 2, 2, 3, hairColor);
      drawRect(ctx, x + 5, dy - 2, 2, 3, hairColor);
      break;
    case 1: // medium / bangs
      drawRect(ctx, x - 4, dy - 5, 12, 4, hairColor);
      drawRect(ctx, x - 4, dy - 2, 2, 5, hairColor);
      drawRect(ctx, x + 6, dy - 2, 2, 5, hairColor);
      drawRect(ctx, x - 2, dy - 1, 4, 2, hairColor); // bangs
      break;
    case 2: // tall / mohawk
      drawRect(ctx, x - 2, dy - 8, 8, 7, hairColor);
      drawRect(ctx, x, dy - 9, 4, 2, hairColor);
      break;
    case 3: // spiky
      drawRect(ctx, x - 3, dy - 5, 10, 4, hairColor);
      drawRect(ctx, x - 4, dy - 6, 3, 2, hairColor);
      drawRect(ctx, x + 1, dy - 7, 3, 2, hairColor);
      drawRect(ctx, x + 5, dy - 6, 3, 2, hairColor);
      break;
  }
  
  // Error exclamation mark
  if (state === 'error') {
    drawRect(ctx, x + 1, dy - 14, 2, 6, '#ef4444');
    drawRect(ctx, x + 1, dy - 7, 2, 2, '#ef4444');
  }
  
  // Hover glow
  if (agent.hovered) {
    ctx.fillStyle = hexToRgba(STATE_COLORS[state] || '#fff', 0.12);
    ctx.fillRect(x - 8, dy - 12, 20, 36);
  }
}

function drawSpeechBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  const maxChars = 20;
  const displayText = text.length > maxChars ? text.slice(0, maxChars - 2) + '..' : text;
  
  ctx.font = 'bold 7px monospace';
  const tw = ctx.measureText(displayText).width;
  const bw = Math.max(tw + 8, 24);
  const bh = 12;
  const bx = Math.floor(x - bw / 2);
  const by = Math.floor(y - bh);
  
  // Bubble
  drawRect(ctx, bx, by, bw, bh, color);
  drawRect(ctx, bx + 1, by + 1, bw - 2, bh - 2, lighten(color, 15));
  // Tail
  drawRect(ctx, x - 1, by + bh, 2, 2, color);
  drawRect(ctx, x, by + bh + 2, 1, 1, color);
  
  // Text
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 7px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayText, Math.floor(x), Math.floor(by + bh / 2));
}

function drawNameLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, emoji: string) {
  const label = `${emoji} ${name}`;
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  // Background for readability
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(Math.floor(x - tw / 2 - 2), y, tw + 4, 10);
  
  ctx.fillStyle = '#fff';
  ctx.fillText(label, Math.floor(x), y + 1);
}

// ─── Red ambient for debug zone ─────────────────────────────────────────────
function drawDebugAmbient(ctx: CanvasRenderingContext2D, time: number) {
  const pulse = 0.03 + Math.sin(time * 0.001) * 0.01;
  const grd = ctx.createLinearGradient(ZONE_W * 2, FLOOR_Y, W, H);
  grd.addColorStop(0, `rgba(239,68,68,0)`);
  grd.addColorStop(1, `rgba(239,68,68,${pulse})`);
  ctx.fillStyle = grd;
  ctx.fillRect(ZONE_W * 2, FLOOR_Y, ZONE_W, H - FLOOR_Y);
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PixelOffice({ agents }: { agents: AgentState[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<{
    agents: AgentAnim[];
    particles: Particle[];
    leds: LED[];
    mouseX: number;
    mouseY: number;
    time: number;
    frameId: number;
  }>({
    agents: [],
    particles: [],
    leds: [],
    mouseX: -999,
    mouseY: -999,
    time: 0,
    frameId: 0,
  });

  // Initialize LEDs for server racks
  useEffect(() => {
    const leds: LED[] = [];
    for (let rack = 0; rack < 3; rack++) {
      for (let i = 0; i < 8; i++) {
        leds.push({
          x: 5 + (i % 4) * 3,
          y: 4 + Math.floor(i / 4) * 9 + (i % 3) * 3,
          color: ['#4CAF50', '#F44336', '#2196F3', '#FFC107', '#00BCD4'][Math.floor(Math.random() * 5)],
          rate: 0.5 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
    animRef.current.leds = leds;
  }, []);

  // Sync agent data to animation state
  useEffect(() => {
    const anim = animRef.current;
    const existing = new Map(anim.agents.map(a => [a.label, a]));
    
    const newAgents: AgentAnim[] = agents.map((a, i) => {
      const prev = existing.get(a.label);
      const h = hashStr(a.label);
      const target = getTargetPos(a.state, i);
      
      if (prev) {
        // Update target and state, keep position for walking
        const stateChanged = prev.state !== a.state;
        return {
          ...prev,
          name: a.name,
          emoji: a.emoji,
          state: a.state,
          detail: a.detail,
          targetX: target.x,
          targetY: target.y,
          isWalking: stateChanged ? true : prev.isWalking,
          errorTimer: a.state === 'error' ? (prev.errorTimer || 100) : 0,
        };
      }
      
      return {
        label: a.label, name: a.name, emoji: a.emoji,
        state: a.state, detail: a.detail,
        x: target.x, y: target.y,
        targetX: target.x, targetY: target.y,
        shirtColor: SHIRT_COLORS[h % SHIRT_COLORS.length],
        hairColor: HAIR_COLORS[(h >> 4) % HAIR_COLORS.length],
        hairStyle: HAIR_STYLES[(h >> 8) % HAIR_STYLES.length],
        walkFrame: 0, walkTimer: 0, isWalking: false,
        bobOffset: 0, bobTimer: Math.random() * Math.PI * 2,
        errorTimer: a.state === 'error' ? 100 : 0,
        hovered: false,
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

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    
    let lastTime = 0;

    function render(timestamp: number) {
      const dt = timestamp - lastTime;
      lastTime = timestamp;
      const anim = animRef.current;
      anim.time = timestamp;
      
      // ─── Update agents ───
      for (const a of anim.agents) {
        // Walking toward target
        const dx = a.targetX - a.x;
        const dy = a.targetY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 2) {
          a.isWalking = true;
          const speed = Math.min(1.5, dist * 0.03); // ease-in-out feel
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
        }
        
        // Bobbing
        a.bobTimer += dt * 0.003;
        a.bobOffset = Math.sin(a.bobTimer) * 1.2;
        
        // Error timer
        if (a.errorTimer > 0) a.errorTimer -= dt * 0.01;
        
        // Hover check
        const mx = anim.mouseX, my = anim.mouseY;
        a.hovered = (mx > a.x - 10 && mx < a.x + 14 && my > a.y - 10 && my < a.y + 25);
      }
      
      // ─── Update particles ───
      if (Math.random() < 0.03) {
        anim.particles.push({
          x: Math.random() * W,
          y: FLOOR_Y + Math.random() * (H - FLOOR_Y),
          vx: (Math.random() - 0.5) * 0.15,
          vy: -0.1 - Math.random() * 0.1,
          life: 0,
          maxLife: 200 + Math.random() * 200,
          size: 1 + Math.random(),
        });
      }
      anim.particles = anim.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        return p.life < p.maxLife;
      });
      
      // ─── Draw ───
      ctx.clearRect(0, 0, W, H);
      
      // Walls
      drawWalls(ctx);
      
      // Wall decorations
      drawFramedPicture(ctx, 100, 40);
      drawClock(ctx, 260, 70, timestamp);
      drawWhiteboard(ctx, 380, 50);
      drawBookshelf(ctx, 530, 100);
      drawSpiderWeb(ctx, W, WALL_H - 5);
      
      // Floor
      drawWoodFloor(ctx, timestamp);
      
      // Debug zone ambient
      drawDebugAmbient(ctx, timestamp);
      
      // Warning stripes in debug zone
      drawWarningStripes(ctx, 660, FLOOR_Y + 2, 290);
      
      // Rug in lounge
      drawRug(ctx, 400, 360);
      
      // ─── Work Zone furniture ───
      for (let i = 0; i < DESK_POSITIONS.length; i++) {
        const dp = DESK_POSITIONS[i];
        // Find agent at this desk
        const agentHere = anim.agents.find(a => {
          const zone = getZoneForState(a.state);
          return zone === 0 && Math.abs(a.targetX - dp.x) < 5 && Math.abs(a.targetY - dp.y) < 5;
        });
        const glowColor = agentHere ? (STATE_COLORS[agentHere.state] || '#263238') : undefined;
        drawDesk(ctx, dp.x - 10, dp.y - 30, glowColor);
        drawChair(ctx, dp.x - 2, dp.y - 12);
      }
      
      // Plants
      drawPlant(ctx, 10, FLOOR_Y + 20);
      drawPlant(ctx, 290, FLOOR_Y + 10);
      drawPlant(ctx, 160, FLOOR_Y + 5);
      
      // Lamps
      drawLamp(ctx, 80, FLOOR_Y - 10, true);
      drawLamp(ctx, 200, FLOOR_Y - 10, true);
      
      // ─── Lounge Zone furniture ───
      drawCouch(ctx, 400, 280);
      drawCoffeeTable(ctx, 415, 320);
      drawCoffeeMachine(ctx, 580, FLOOR_Y + 10, timestamp);
      
      // ─── Debug Zone furniture ───
      // Server racks
      const rackX = [670, 720, 770];
      const ledsPerRack = 8;
      for (let r = 0; r < 3; r++) {
        const rackLeds = anim.leds.slice(r * ledsPerRack, (r + 1) * ledsPerRack);
        drawServerRack(ctx, rackX[r], FLOOR_Y + 15, rackLeds, timestamp);
      }
      
      drawTerminalDesk(ctx, 830, 260, timestamp);
      
      // ─── Draw characters (sorted by Y for depth) ───
      const sorted = [...anim.agents].sort((a, b) => a.y - b.y);
      for (const agent of sorted) {
        drawCharacter(ctx, agent, timestamp);
        
        // Name label
        drawNameLabel(ctx, agent.x + 2, agent.y + 22, agent.name, agent.emoji);
        
        // Speech bubble (non-idle or hovered)
        if (agent.state !== 'idle' || agent.hovered) {
          const bubbleText = agent.detail || agent.state;
          const color = STATE_COLORS[agent.state] || '#64748b';
          drawSpeechBubble(ctx, agent.x + 2, agent.y + agent.bobOffset - 16 + (agent.state === 'error' ? -4 : 0), bubbleText, color);
        }
      }
      
      // ─── Dust particles ───
      for (const p of anim.particles) {
        const alpha = Math.min(0.25, (1 - p.life / p.maxLife) * 0.25);
        ctx.fillStyle = `rgba(255,248,230,${alpha})`;
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), Math.ceil(p.size), Math.ceil(p.size));
      }
      
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
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ imageRendering: 'pixelated' }}
        className="border border-gray-700 rounded-lg shadow-2xl"
      />
    </div>
  );
}

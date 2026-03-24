// Shared 3D layout constants for the office scene.
// 1 unit = 20px from the original 2D layout.

import { hashStr, STATE_COLORS } from '@/lib/agents';

// Re-export for convenience
export { hashStr, STATE_COLORS };
export { type Conversation } from '@/lib/conversations';
export { type SlackVisitor } from '@/lib/visitors';
export { type AgentState } from '@/lib/agents';

export const ACTIVE_STATES = new Set(['writing', 'researching', 'executing', 'syncing']);

// Grid dimensions (converted from pixels: value / 20)
export const ROOM_W = 11;    // 220px / 20
export const ROOM_H = 10;    // 200px / 20
export const CORRIDOR = 2;   // 40px / 20
export const COLS = 4;
export const ROWS = 4;
export const WALL_HEIGHT = 2.5;

export const GRID_W = COLS * ROOM_W + (COLS - 1) * CORRIDOR; // 50
export const GRID_H = ROWS * ROOM_H + (ROWS - 1) * CORRIDOR; // 46

// Break room is below the grid
export const BREAK_ROOM_H = 9;  // 180px / 20
export const BREAK_ROOM_Z = GRID_H + CORRIDOR;
export const W = GRID_W;
export const H = BREAK_ROOM_Z + BREAK_ROOM_H;

// Accent wall colors for each room
export const ACCENT_WALLS = [
  '#5B7FA5', '#7B6B8D', '#6B8E6B', '#B0785A', '#5A8A8A', '#8B6B6B', '#6B7B8B', '#8A7B5A',
  '#6B8B7B', '#7B6B7B', '#5B8B6B', '#8B7B6B', '#6B6B8B', '#7B8B5B', '#8B5B6B', '#5B7B8B',
  '#5B7FA5', '#7B6B8D', '#6B8E6B', '#B0785A',
];

// Decoration types
export const DECORATION_TYPES = [
  'plant', 'bookshelf', 'lamp', 'coffeeMachine', 'serverRack', 'framedPicture', 'clock', 'whiteboard',
] as const;
export type DecorationType = typeof DECORATION_TYPES[number];

// Agent color palettes
export const SHIRT_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#e67e22',
  '#1abc9c', '#e84393', '#0984e3', '#6c5ce7', '#00b894',
  '#fdcb6e', '#fab1a0', '#74b9ff', '#a29bfe', '#ff7675', '#55efc4',
];
export const HAIR_COLORS = ['#2c1810', '#8B4513', '#DAA520', '#1a1a2e', '#C0392B', '#5D4037', '#212121', '#D4A574'];
export const HAIR_STYLES = [0, 1, 2, 3];

export const VISITOR_SHIRT_COLORS = ['#2196F3', '#FF9800', '#4CAF50', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B'];
export const VISITOR_SKIN_COLORS = ['#FFCC80', '#D4A574', '#FFE0BD', '#C68642', '#8D5524', '#F1C27D'];

// --- 3D position helpers (z replaces y from 2D) ---

export function getRoomOrigin3D(index: number): { x: number; z: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    x: col * (ROOM_W + CORRIDOR),
    z: row * (ROOM_H + CORRIDOR),
  };
}

export function getDeskPos3D(roomIndex: number): { x: number; z: number } {
  const o = getRoomOrigin3D(roomIndex);
  return { x: o.x + 90 / 20, z: o.z + 80 / 20 }; // 4.5, 4.0
}

export function getChairPos3D(roomIndex: number): { x: number; z: number } {
  const o = getRoomOrigin3D(roomIndex);
  return { x: o.x + 95 / 20, z: o.z + 105 / 20 }; // 4.75, 5.25
}

export function getDoorPos3D(roomIndex: number): { x: number; z: number } {
  const o = getRoomOrigin3D(roomIndex);
  return { x: o.x + ROOM_W / 2, z: o.z + ROOM_H };
}

export function getMonitorPos3D(roomIndex: number): { x: number; z: number } {
  const o = getRoomOrigin3D(roomIndex);
  return { x: o.x + 104 / 20, z: o.z + 71 / 20 }; // 5.2, 3.55
}

export function getRoomDecorations(label: string): [DecorationType, DecorationType] {
  const h = hashStr(label);
  const d1 = DECORATION_TYPES[h % DECORATION_TYPES.length];
  const d2 = DECORATION_TYPES[(h >> 4) % DECORATION_TYPES.length];
  return d1 === d2
    ? [d1, DECORATION_TYPES[(h >> 8) % DECORATION_TYPES.length]]
    : [d1, d2];
}

// Break room seats: pre-converted from 2D pixel coords to 3D units
const BREAK_ROOM_Y_2D = GRID_H * 20 + CORRIDOR * 20;
const BREAK_ROOM_SEATS_3D: { x: number; z: number }[] = [
  { x: 80, y: BREAK_ROOM_Y_2D + 60 },
  { x: 160, y: BREAK_ROOM_Y_2D + 90 },
  { x: 240, y: BREAK_ROOM_Y_2D + 55 },
  { x: 320, y: BREAK_ROOM_Y_2D + 85 },
  { x: 400, y: BREAK_ROOM_Y_2D + 60 },
  { x: 480, y: BREAK_ROOM_Y_2D + 90 },
  { x: 560, y: BREAK_ROOM_Y_2D + 55 },
  { x: 640, y: BREAK_ROOM_Y_2D + 85 },
  { x: 720, y: BREAK_ROOM_Y_2D + 60 },
  { x: 800, y: BREAK_ROOM_Y_2D + 90 },
  { x: 130, y: BREAK_ROOM_Y_2D + 130 },
  { x: 270, y: BREAK_ROOM_Y_2D + 130 },
  { x: 410, y: BREAK_ROOM_Y_2D + 130 },
  { x: 550, y: BREAK_ROOM_Y_2D + 130 },
  { x: 690, y: BREAK_ROOM_Y_2D + 130 },
  { x: 830, y: BREAK_ROOM_Y_2D + 130 },
  { x: 100, y: BREAK_ROOM_Y_2D + 40 },
  { x: 300, y: BREAK_ROOM_Y_2D + 40 },
  { x: 500, y: BREAK_ROOM_Y_2D + 40 },
  { x: 700, y: BREAK_ROOM_Y_2D + 40 },
].map(s => ({ x: s.x / 20, z: s.y / 20 }));

export function getBreakRoomSeat3D(index: number): { x: number; z: number } {
  return BREAK_ROOM_SEATS_3D[index % BREAK_ROOM_SEATS_3D.length];
}

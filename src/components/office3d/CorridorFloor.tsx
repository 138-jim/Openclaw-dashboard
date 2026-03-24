'use client';

import React from 'react';
import {
  ROOM_W, ROOM_H, CORRIDOR, COLS, ROWS,
  GRID_W, GRID_H,
} from '@/lib/office-layout';
import grad from './toon-gradient';

interface CorridorDef { x: number; z: number; w: number; d: number }
interface Tile { x: number; z: number; s: number }

function generateCheckerTiles(cx: number, cz: number, w: number, d: number): Tile[] {
  const tileSize = 1;
  const tiles: Tile[] = [];
  const startX = cx - w / 2 + tileSize / 2;
  const startZ = cz - d / 2 + tileSize / 2;
  const nx = Math.floor(w / tileSize);
  const nz = Math.floor(d / tileSize);

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      if ((ix + iz) % 2 === 1) {
        tiles.push({ x: startX + ix * tileSize, z: startZ + iz * tileSize, s: tileSize });
      }
    }
  }
  return tiles;
}

// Pre-compute corridor positions and checker tiles (all derived from constants)
const CORRIDORS: (CorridorDef & { tiles: Tile[] })[] = (() => {
  const result: (CorridorDef & { tiles: Tile[] })[] = [];

  for (let row = 0; row < ROWS - 1; row++) {
    const z = (row + 1) * ROOM_H + row * CORRIDOR + CORRIDOR / 2;
    const c = { x: GRID_W / 2, z, w: GRID_W, d: CORRIDOR };
    result.push({ ...c, tiles: generateCheckerTiles(c.x, c.z, c.w, c.d) });
  }

  for (let col = 0; col < COLS - 1; col++) {
    const x = (col + 1) * ROOM_W + col * CORRIDOR + CORRIDOR / 2;
    const c = { x, z: GRID_H / 2, w: CORRIDOR, d: GRID_H };
    result.push({ ...c, tiles: generateCheckerTiles(c.x, c.z, c.w, c.d) });
  }

  const breakC = { x: GRID_W / 2, z: GRID_H + CORRIDOR / 2, w: GRID_W, d: CORRIDOR };
  result.push({ ...breakC, tiles: generateCheckerTiles(breakC.x, breakC.z, breakC.w, breakC.d) });

  return result;
})();

const COLOR_A = '#C4BDB5';
const COLOR_B = '#B8B0A8';

export default function CorridorFloor() {
  return (
    <group>
      {CORRIDORS.map((c, i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[c.x, 0.006, c.z]} receiveShadow>
            <planeGeometry args={[c.w, c.d]} />
            <meshToonMaterial color={COLOR_A} gradientMap={grad} />
          </mesh>
          {c.tiles.map((tile, ti) => (
            <mesh key={ti} rotation={[-Math.PI / 2, 0, 0]} position={[tile.x, 0.007, tile.z]} receiveShadow>
              <planeGeometry args={[tile.s, tile.s]} />
              <meshToonMaterial color={COLOR_B} gradientMap={grad} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

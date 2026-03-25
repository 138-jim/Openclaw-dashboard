// @ts-nocheck
'use client';

import React from 'react';
import { Billboard, Text } from '@react-three/drei';
import { GRID_W, LOBBY_Z, LOBBY_H, WALL_HEIGHT } from '@/lib/office-layout';
import { Plant } from './Furniture';
import grad from './toon-gradient';

export default function Lobby() {
  const lw = GRID_W;
  const lh = LOBBY_H;

  return (
    <group position={[0, 0, LOBBY_Z]}>
      {/* Floor — polished tile */}
      <mesh position={[lw / 2, -0.025, lh / 2]} receiveShadow>
        <boxGeometry args={[lw, 0.05, lh]} />
        <meshToonMaterial color="#D0C8BC" gradientMap={grad} />
      </mesh>

      {/* Back wall */}
      <mesh position={[lw / 2, WALL_HEIGHT / 2, 0.08]} castShadow>
        <boxGeometry args={[lw, WALL_HEIGHT, 0.15]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* "VISITORS" sign */}
      <Billboard position={[lw / 2, WALL_HEIGHT - 0.2, 0.2]}>
        <Text fontSize={0.4} color="#FFFFFF" outlineWidth={0.02} outlineColor="#333333">
          Visitors Lobby
        </Text>
      </Billboard>

      {/* Reception desk */}
      <mesh position={[lw / 2, 0.4, 1.5]} castShadow>
        <boxGeometry args={[4, 0.8, 1]} />
        <meshToonMaterial color="#5D4037" gradientMap={grad} />
      </mesh>
      {/* Desk top */}
      <mesh position={[lw / 2, 0.82, 1.5]} castShadow>
        <boxGeometry args={[4.2, 0.05, 1.1]} />
        <meshToonMaterial color="#795548" gradientMap={grad} />
      </mesh>

      {/* Waiting area benches */}
      {[lw * 0.2, lw * 0.5, lw * 0.8].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.25, 3.5]} castShadow>
            <boxGeometry args={[2.5, 0.4, 0.8]} />
            <meshToonMaterial color="#5C6BC0" gradientMap={grad} />
          </mesh>
          <mesh position={[x, 0.55, 3.15]} castShadow>
            <boxGeometry args={[2.5, 0.3, 0.15]} />
            <meshToonMaterial color="#3F51B5" gradientMap={grad} />
          </mesh>
        </group>
      ))}

      {/* Plants */}
      <group position={[1, 0, 1]}><Plant /></group>
      <group position={[lw - 1, 0, 1]}><Plant /></group>
      <group position={[lw / 2 - 3, 0, 5]}><Plant /></group>
      <group position={[lw / 2 + 3, 0, 5]}><Plant /></group>

      {/* Floor mat */}
      <mesh position={[lw / 2, 0.01, 3]} receiveShadow>
        <boxGeometry args={[lw * 0.6, 0.02, 3]} />
        <meshToonMaterial color="#3F51B5" gradientMap={grad} />
      </mesh>

      {/* Side walls */}
      <mesh position={[0.08, WALL_HEIGHT / 2, lh / 2]} castShadow>
        <boxGeometry args={[0.15, WALL_HEIGHT, lh]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>
      <mesh position={[lw - 0.08, WALL_HEIGHT / 2, lh / 2]} castShadow>
        <boxGeometry args={[0.15, WALL_HEIGHT, lh]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* Ceiling light */}
      <pointLight position={[lw / 2, WALL_HEIGHT - 0.1, lh / 2]} color="#FFF5E6" intensity={0.5} distance={10} />
    </group>
  );
}

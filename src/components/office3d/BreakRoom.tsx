'use client';

import React from 'react';
import { Billboard, Text } from '@react-three/drei';
import {
  GRID_W, BREAK_ROOM_Z, BREAK_ROOM_H, WALL_HEIGHT,
} from '@/lib/office-layout';
import { CoffeeMachine, Plant } from './Furniture';
import grad from './toon-gradient';

export default function BreakRoom() {
  const wallThick = 0.15;
  const bw = GRID_W;
  const bh = BREAK_ROOM_H;

  return (
    <group position={[0, 0, BREAK_ROOM_Z]}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[bw / 2, 0.005, bh / 2]} receiveShadow>
        <planeGeometry args={[bw, bh]} />
        <meshToonMaterial color="#D7CFC4" gradientMap={grad} />
      </mesh>

      {/* Back wall */}
      <mesh position={[bw / 2, WALL_HEIGHT / 2, wallThick / 2]} castShadow>
        <boxGeometry args={[bw, WALL_HEIGHT, wallThick]} />
        <meshToonMaterial color="#7B8E6B" gradientMap={grad} />
      </mesh>

      {/* Left wall */}
      <mesh position={[wallThick / 2, WALL_HEIGHT / 2, bh / 2]} castShadow>
        <boxGeometry args={[wallThick, WALL_HEIGHT, bh]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* Right wall */}
      <mesh position={[bw - wallThick / 2, WALL_HEIGHT / 2, bh / 2]} castShadow>
        <boxGeometry args={[wallThick, WALL_HEIGHT, bh]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* Label */}
      <Billboard position={[bw / 2, WALL_HEIGHT - 0.3, 0.3]} follow={true} lockX={false} lockY={false} lockZ={false}>
        <Text fontSize={0.4} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
          Break Room
        </Text>
      </Billboard>

      {/* Ceiling light */}
      <mesh position={[bw / 2, WALL_HEIGHT - 0.05, bh / 2]}>
        <cylinderGeometry args={[0.2, 0.25, 0.06, 8]} />
        <meshToonMaterial color="#FFF9C4" gradientMap={grad} />
      </mesh>
      <pointLight position={[bw / 2, WALL_HEIGHT - 0.1, bh / 2]} color="#FFF5E6" intensity={0.5} distance={12} />

      {/* Coffee machine */}
      <group position={[bw - 2, 0, 1]}>
        <CoffeeMachine />
      </group>

      {/* Plants */}
      <group position={[1.5, 0, 1]}>
        <Plant />
      </group>
      <group position={[bw - 1, 0, bh - 1]}>
        <Plant />
      </group>

      {/* Simple seating: benches/couches */}
      {[8, 18, 28, 38].map((x, i) => (
        <group key={i}>
          {/* Couch */}
          <mesh position={[x, 0.3, bh / 2]} castShadow>
            <boxGeometry args={[3, 0.5, 1.2]} />
            <meshToonMaterial color="#7986CB" gradientMap={grad} />
          </mesh>
          {/* Couch back */}
          <mesh position={[x, 0.65, bh / 2 - 0.5]} castShadow>
            <boxGeometry args={[3, 0.4, 0.2]} />
            <meshToonMaterial color="#5C6BC0" gradientMap={grad} />
          </mesh>
          {/* Coffee table */}
          <mesh position={[x, 0.25, bh / 2 + 1.2]} castShadow>
            <boxGeometry args={[1.5, 0.05, 0.6]} />
            <meshToonMaterial color="#8D6E63" gradientMap={grad} />
          </mesh>
          {/* Table legs */}
          {[[-0.6, -0.2], [0.6, -0.2], [-0.6, 0.2], [0.6, 0.2]].map(([dx, dz], li) => (
            <mesh key={li} position={[x + dx, 0.12, bh / 2 + 1.2 + dz]}>
              <boxGeometry args={[0.04, 0.24, 0.04]} />
              <meshToonMaterial color="#6D4C41" gradientMap={grad} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

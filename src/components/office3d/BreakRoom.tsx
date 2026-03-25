// @ts-nocheck
'use client';

import React from 'react';
import { Billboard, Text } from '@react-three/drei';
import {
  GRID_H, BREAK_ROOM_X, BREAK_ROOM_W, WALL_HEIGHT,
} from '@/lib/office-layout';
import { CoffeeMachine, Plant } from './Furniture';
import grad from './toon-gradient';

export default function BreakRoom() {
  const wallThick = 0.15;
  const bw = BREAK_ROOM_W;
  const bh = GRID_H;

  return (
    <group position={[BREAK_ROOM_X, 0, 0]}>
      {/* Floor */}
      <mesh position={[bw / 2, -0.025, bh / 2]} receiveShadow>
        <boxGeometry args={[bw, 0.05, bh]} />
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
      <group position={[2, 0, 2]}>
        <CoffeeMachine />
      </group>

      {/* Vending machine */}
      <group position={[bw - 2, 0, 2]}>
        <mesh position={[0, 1, 0]} castShadow>
          <boxGeometry args={[1.5, 2, 0.8]} />
          <meshToonMaterial color="#1565C0" gradientMap={grad} />
        </mesh>
        {/* Drink slots */}
        {[0, 1, 2].map(row => [0, 1, 2].map(col => {
          const colors = ['#F44336', '#FFC107', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#00BCD4', '#E91E63', '#8BC34A'];
          return (
            <mesh key={`${row}-${col}`} position={[-0.35 + col * 0.35, 1.5 - row * 0.4, 0.35]}>
              <boxGeometry args={[0.25, 0.3, 0.05]} />
              <meshBasicMaterial color={colors[row * 3 + col]} />
            </mesh>
          );
        }))}
        {/* Dispenser */}
        <mesh position={[0, 0.3, 0.35]}>
          <boxGeometry args={[0.8, 0.4, 0.05]} />
          <meshToonMaterial color="#0D47A1" gradientMap={grad} />
        </mesh>
      </group>

      {/* Plants */}
      <group position={[1, 0, bh - 2]}><Plant /></group>
      <group position={[bw - 1, 0, bh - 2]}><Plant /></group>
      <group position={[bw / 2, 0, 1]}><Plant /></group>

      {/* Potted tree */}
      <group position={[bw - 2, 0, bh - 3]}>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.2, 0.25, 0.3, 8]} /><meshToonMaterial color="#D84315" gradientMap={grad} /></mesh>
        <mesh position={[0, 0.8, 0]}><sphereGeometry args={[0.5, 8, 8]} /><meshToonMaterial color="#2E7D32" gradientMap={grad} /></mesh>
        <mesh position={[0.3, 0.6, 0.2]}><sphereGeometry args={[0.3, 8, 8]} /><meshToonMaterial color="#388E3C" gradientMap={grad} /></mesh>
        <mesh position={[-0.2, 0.9, -0.2]}><sphereGeometry args={[0.25, 8, 8]} /><meshToonMaterial color="#43A047" gradientMap={grad} /></mesh>
      </group>

      {/* Posters */}
      <Billboard position={[3, 1.8, 0.3]} follow={false}>
        <mesh><planeGeometry args={[1.5, 1]} /><meshBasicMaterial color="#37474F" /></mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.25} color="#7C4DFF">RELAX</Text>
      </Billboard>
      <Billboard position={[bw - 3, 1.8, 0.3]} follow={false}>
        <mesh><planeGeometry args={[1.5, 1]} /><meshBasicMaterial color="#37474F" /></mesh>
        <Text position={[0, 0, 0.01]} fontSize={0.25} color="#00BCD4">CHILL</Text>
      </Billboard>

      {/* Couches along the room (Z axis) */}
      {[8, 18, 28, 38].map((zPos, i) => {
        const z = Math.min(zPos, bh - 3);
        return (
          <group key={i}>
            {/* Couch */}
            <mesh position={[bw / 2 - 2, 0.3, z]} castShadow>
              <boxGeometry args={[3, 0.5, 1.2]} />
              <meshToonMaterial color="#7B1FA2" gradientMap={grad} />
            </mesh>
            <mesh position={[bw / 2 - 2, 0.65, z - 0.5]} castShadow>
              <boxGeometry args={[3, 0.4, 0.2]} />
              <meshToonMaterial color="#6A1B9A" gradientMap={grad} />
            </mesh>
            {/* Coffee table */}
            <mesh position={[bw / 2 + 1.5, 0.25, z]} castShadow>
              <boxGeometry args={[1.2, 0.05, 0.6]} />
              <meshToonMaterial color="#795548" gradientMap={grad} />
            </mesh>
          </group>
        );
      })}

      {/* Accent rug */}
      <mesh position={[bw / 2, 0.01, bh / 2]} receiveShadow>
        <boxGeometry args={[8, 0.02, 15]} />
        <meshToonMaterial color="#9C27B0" gradientMap={grad} />
      </mesh>
    </group>
  );
}

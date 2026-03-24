'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  ROOM_W, ROOM_H, WALL_HEIGHT, ACCENT_WALLS,
  getRoomOrigin3D, getDeskPos3D, getChairPos3D, getRoomDecorations,
} from '@/lib/office-layout';
import { Desk, Chair, Decoration } from './Furniture';
import grad from './toon-gradient';

interface RoomProps {
  roomIndex: number;
  label: string;
  name: string;
  emoji: string;
  glowColor?: string;
  isError: boolean;
}

export default function Room({ roomIndex, label, name, emoji, glowColor, isError }: RoomProps) {
  const origin = getRoomOrigin3D(roomIndex);
  const accent = ACCENT_WALLS[roomIndex % ACCENT_WALLS.length];
  const deskPos = getDeskPos3D(roomIndex);
  const chairPos = getChairPos3D(roomIndex);
  const [deco1Type, deco2Type] = getRoomDecorations(label);

  // Darker accent for rug
  const rugColor = useMemo(() => {
    const r = parseInt(accent.slice(1, 3), 16);
    const g = parseInt(accent.slice(3, 5), 16);
    const b = parseInt(accent.slice(5, 7), 16);
    return `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`;
  }, [accent]);

  // Error pulse ref
  const errorRef = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (errorRef.current && isError) {
      const mat = errorRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.15 + Math.sin(clock.getElapsedTime() * 4) * 0.1;
    }
  });

  const wallThick = 0.15;
  const doorW = 1.8;

  return (
    <group position={[origin.x, 0, origin.z]}>
      {/* ── Floor ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.005, ROOM_H / 2]} receiveShadow>
        <planeGeometry args={[ROOM_W, ROOM_H]} />
        <meshToonMaterial color="#C8B08A" gradientMap={grad} />
      </mesh>

      {/* ── Rug ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.015, ROOM_H * 0.45]} receiveShadow>
        <planeGeometry args={[4.5, 3]} />
        <meshToonMaterial color={rugColor} gradientMap={grad} />
      </mesh>

      {/* ── Back wall (accent) ── */}
      <mesh position={[ROOM_W / 2, WALL_HEIGHT / 2, wallThick / 2]} castShadow receiveShadow>
        <boxGeometry args={[ROOM_W, WALL_HEIGHT, wallThick]} />
        <meshToonMaterial color={accent} gradientMap={grad} />
      </mesh>

      {/* ── Window on back wall ── */}
      <mesh position={[ROOM_W / 2, WALL_HEIGHT * 0.6, 0.01]}>
        <boxGeometry args={[1.8, 1.0, 0.02]} />
        <meshStandardMaterial color="#87CEEB" emissive="#87CEEB" emissiveIntensity={0.3} transparent opacity={0.7} />
      </mesh>

      {/* ── Left wall ── */}
      <mesh position={[wallThick / 2, WALL_HEIGHT / 2, ROOM_H / 2]} castShadow receiveShadow>
        <boxGeometry args={[wallThick, WALL_HEIGHT, ROOM_H]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* ── Right wall ── */}
      <mesh position={[ROOM_W - wallThick / 2, WALL_HEIGHT / 2, ROOM_H / 2]} castShadow receiveShadow>
        <boxGeometry args={[wallThick, WALL_HEIGHT, ROOM_H]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* ── Bottom wall left segment ── */}
      <mesh position={[(ROOM_W / 2 - doorW / 2) / 2, WALL_HEIGHT / 2, ROOM_H - wallThick / 2]} castShadow>
        <boxGeometry args={[ROOM_W / 2 - doorW / 2, WALL_HEIGHT, wallThick]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* ── Bottom wall right segment ── */}
      <mesh position={[ROOM_W - (ROOM_W / 2 - doorW / 2) / 2, WALL_HEIGHT / 2, ROOM_H - wallThick / 2]} castShadow>
        <boxGeometry args={[ROOM_W / 2 - doorW / 2, WALL_HEIGHT, wallThick]} />
        <meshToonMaterial color="#E8E0D4" gradientMap={grad} />
      </mesh>

      {/* ── Door frame ── */}
      {/* Left post */}
      <mesh position={[ROOM_W / 2 - doorW / 2, WALL_HEIGHT / 2, ROOM_H - wallThick / 2]}>
        <boxGeometry args={[0.08, WALL_HEIGHT, wallThick + 0.02]} />
        <meshToonMaterial color="#5D4037" gradientMap={grad} />
      </mesh>
      {/* Right post */}
      <mesh position={[ROOM_W / 2 + doorW / 2, WALL_HEIGHT / 2, ROOM_H - wallThick / 2]}>
        <boxGeometry args={[0.08, WALL_HEIGHT, wallThick + 0.02]} />
        <meshToonMaterial color="#5D4037" gradientMap={grad} />
      </mesh>
      {/* Lintel */}
      <mesh position={[ROOM_W / 2, WALL_HEIGHT - 0.1, ROOM_H - wallThick / 2]}>
        <boxGeometry args={[doorW + 0.16, 0.15, wallThick + 0.02]} />
        <meshToonMaterial color="#5D4037" gradientMap={grad} />
      </mesh>

      {/* ── Baseboard ── */}
      {/* Back */}
      <mesh position={[ROOM_W / 2, 0.04, wallThick]}>
        <boxGeometry args={[ROOM_W - wallThick * 2, 0.08, 0.04]} />
        <meshToonMaterial color="#8D6E63" gradientMap={grad} />
      </mesh>
      {/* Left */}
      <mesh position={[wallThick, 0.04, ROOM_H / 2]}>
        <boxGeometry args={[0.04, 0.08, ROOM_H - wallThick * 2]} />
        <meshToonMaterial color="#8D6E63" gradientMap={grad} />
      </mesh>
      {/* Right */}
      <mesh position={[ROOM_W - wallThick, 0.04, ROOM_H / 2]}>
        <boxGeometry args={[0.04, 0.08, ROOM_H - wallThick * 2]} />
        <meshToonMaterial color="#8D6E63" gradientMap={grad} />
      </mesh>

      {/* ── Ceiling light ── */}
      <mesh position={[ROOM_W / 2, WALL_HEIGHT - 0.05, ROOM_H / 2]}>
        <cylinderGeometry args={[0.15, 0.2, 0.06, 8]} />
        <meshToonMaterial color="#FFF9C4" gradientMap={grad} />
      </mesh>
      <pointLight position={[ROOM_W / 2, WALL_HEIGHT - 0.1, ROOM_H / 2]} color="#FFF5E6" intensity={0.4} distance={8} />

      {/* ── Nameplate on back wall ── */}
      <Billboard position={[ROOM_W / 2, WALL_HEIGHT - 0.3, 0.2]} follow={true} lockX={false} lockY={false} lockZ={false}>
        <Text fontSize={0.3} color="#FFFFFF" anchorX="center" anchorY="middle" outlineWidth={0.015} outlineColor="#000000">
          {`${emoji} ${name}`}
        </Text>
      </Billboard>

      {/* ── Desk ── */}
      <group position={[deskPos.x - origin.x, 0, deskPos.z - origin.z]}>
        <Desk glowColor={glowColor} />
      </group>

      {/* ── Chair ── */}
      <group position={[chairPos.x - origin.x, 0, chairPos.z - origin.z]}>
        <Chair />
      </group>

      {/* ── Decorations ── */}
      <Decoration type={deco1Type} position={[ROOM_W - 1.5, 0, 1.5]} />
      <Decoration type={deco2Type} position={[1.5, 0, 1.5]} />

      {/* ── Error overlay ── */}
      {isError && (
        <mesh ref={errorRef} rotation={[-Math.PI / 2, 0, 0]} position={[ROOM_W / 2, 0.02, ROOM_H / 2]}>
          <planeGeometry args={[ROOM_W - 0.5, ROOM_H - 0.5]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// @ts-nocheck
'use client';

import React, { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import grad from './toon-gradient';

// ─── Desk ────────────────────────────────────────────────────────────────────
export function Desk({ glowColor }: { glowColor?: string }) {

  const screenColor = glowColor && glowColor !== '#263238' ? glowColor : '#263238';
  const emissiveIntensity = glowColor && glowColor !== '#263238' ? 0.4 : 0;

  return (
    <group>
      {/* Table top */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.08, 1]} />
        <meshToonMaterial color="#8D6E63" gradientMap={grad} />
      </mesh>
      {/* Legs */}
      {[[-0.9, 0.35, -0.4], [0.9, 0.35, -0.4], [-0.9, 0.35, 0.4], [0.9, 0.35, 0.4]].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <boxGeometry args={[0.05, 0.7, 0.05]} />
          <meshToonMaterial color="#6D4C41" gradientMap={grad} />
        </mesh>
      ))}
      {/* Monitor frame */}
      <mesh position={[0, 1.0, -0.3]} castShadow>
        <boxGeometry args={[0.7, 0.5, 0.05]} />
        <meshToonMaterial color="#37474F" gradientMap={grad} />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 1.0, -0.27]}>
        <boxGeometry args={[0.6, 0.4, 0.01]} />
        <meshToonMaterial color={screenColor} emissive={screenColor} emissiveIntensity={emissiveIntensity} gradientMap={grad} />
      </mesh>
      {/* Monitor stand */}
      <mesh position={[0, 0.76, -0.3]}>
        <boxGeometry args={[0.15, 0.04, 0.08]} />
        <meshToonMaterial color="#546E7A" gradientMap={grad} />
      </mesh>
      {/* Keyboard */}
      <mesh position={[0, 0.75, 0.1]}>
        <boxGeometry args={[0.5, 0.02, 0.15]} />
        <meshToonMaterial color="#90A4AE" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// ─── Chair ───────────────────────────────────────────────────────────────────
export function Chair() {

  return (
    <group>
      {/* Seat */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <meshToonMaterial color="#455A64" gradientMap={grad} />
      </mesh>
      {/* Back */}
      <mesh position={[0, 0.75, -0.22]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.06]} />
        <meshToonMaterial color="#37474F" gradientMap={grad} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
        <meshToonMaterial color="#616161" gradientMap={grad} />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.04, 8]} />
        <meshToonMaterial color="#424242" gradientMap={grad} />
      </mesh>
      {/* 5 legs */}
      {[0, 1, 2, 3, 4].map(i => {
        const angle = (i / 5) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.22, 0.02, Math.sin(angle) * 0.22]}>
            <boxGeometry args={[0.04, 0.02, 0.2]} />
            <meshToonMaterial color="#424242" gradientMap={grad} />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Plant ───────────────────────────────────────────────────────────────────
export function Plant() {

  const greens = ['#4CAF50', '#388E3C', '#66BB6A', '#2E7D32'];
  return (
    <group>
      {/* Pot */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.12, 0.2, 8]} />
        <meshToonMaterial color="#D84315" gradientMap={grad} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 8]} />
        <meshToonMaterial color="#3E2723" gradientMap={grad} />
      </mesh>
      {/* Leaves */}
      {[[0, 0.35, 0, 0.1], [0.06, 0.3, 0.05, 0.08], [-0.05, 0.32, -0.04, 0.09], [0.03, 0.4, -0.03, 0.07]].map((leaf, i) => (
        <mesh key={i} position={[leaf[0], leaf[1], leaf[2]]} castShadow>
          <sphereGeometry args={[leaf[3], 8, 8]} />
          <meshToonMaterial color={greens[i % greens.length]} gradientMap={grad} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Bookshelf ───────────────────────────────────────────────────────────────
export function Bookshelf() {

  const bookColors = ['#E53935', '#1E88E5', '#43A047', '#FDD835', '#8E24AA', '#FB8C00', '#00ACC1', '#D81B60'];
  return (
    <group>
      {/* Frame */}
      <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 2.0, 0.35]} />
        <meshToonMaterial color="#4E342E" gradientMap={grad} />
      </mesh>
      {/* Shelves + books */}
      {[0.5, 1.0, 1.5].map((sy, si) => (
        <group key={si}>
          {/* Shelf */}
          <mesh position={[0, sy, 0.02]}>
            <boxGeometry args={[0.9, 0.04, 0.3]} />
            <meshToonMaterial color="#5D4037" gradientMap={grad} />
          </mesh>
          {/* Books on shelf */}
          {Array.from({ length: 6 }, (_, bi) => {
            const bx = -0.35 + bi * 0.13;
            const bh = 0.2 + (bi % 3) * 0.05;
            return (
              <mesh key={bi} position={[bx, sy + 0.02 + bh / 2, 0.04]}>
                <boxGeometry args={[0.08, bh, 0.2]} />
                <meshToonMaterial color={bookColors[(si * 6 + bi) % bookColors.length]} gradientMap={grad} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

// ─── Lamp ────────────────────────────────────────────────────────────────────
export function Lamp({ on = true }: { on?: boolean }) {

  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.04, 8]} />
        <meshToonMaterial color="#757575" gradientMap={grad} />
      </mesh>
      {/* Pole */}
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1.0, 8]} />
        <meshToonMaterial color="#9E9E9E" gradientMap={grad} />
      </mesh>
      {/* Shade */}
      <mesh position={[0, 1.15, 0]}>
        <coneGeometry args={[0.2, 0.25, 8]} />
        <meshToonMaterial color={on ? '#FFE082' : '#9E9E9E'} gradientMap={grad} />
      </mesh>
      {on && <pointLight position={[0, 1.0, 0]} color="#FFE082" intensity={0.3} distance={4} />}
    </group>
  );
}

// ─── CoffeeMachine ───────────────────────────────────────────────────────────
export function CoffeeMachine() {

  return (
    <group>
      {/* Body */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.3]} />
        <meshToonMaterial color="#424242" gradientMap={grad} />
      </mesh>
      {/* Buttons */}
      {[['#4CAF50', -0.08], ['#F44336', 0], ['#FFC107', 0.08]].map(([color, ox], i) => (
        <mesh key={i} position={[ox as number, 0.42, 0.16]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshToonMaterial color={color as string} emissive={color as string} emissiveIntensity={0.3} gradientMap={grad} />
        </mesh>
      ))}
      {/* Cup area */}
      <mesh position={[0, 0.1, 0.08]}>
        <boxGeometry args={[0.2, 0.1, 0.15]} />
        <meshToonMaterial color="#212121" gradientMap={grad} />
      </mesh>
      {/* Steam (static) */}
      {[0.6, 0.7, 0.82].map((y, i) => (
        <mesh key={i} position={[(i - 1) * 0.04, y, 0.08]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#FFFFFF" transparent opacity={0.25 - i * 0.05} />
        </mesh>
      ))}
    </group>
  );
}

// ─── ServerRack ──────────────────────────────────────────────────────────────
export function ServerRack() {

  const ledRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ledRef.current) return;
    const t = clock.getElapsedTime();
    ledRef.current.children.forEach((child, i) => {
      const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (mat) mat.emissiveIntensity = Math.sin(t * 3 + i * 1.5) > 0 ? 0.8 : 0.1;
    });
  });
  return (
    <group>
      {/* Frame */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.6, 2.0, 0.4]} />
        <meshToonMaterial color="#37474F" gradientMap={grad} />
      </mesh>
      {/* Rack unit insets */}
      {[0.3, 0.65, 1.0, 1.35, 1.7].map((y, i) => (
        <mesh key={i} position={[0, y, 0.18]}>
          <boxGeometry args={[0.5, 0.25, 0.05]} />
          <meshToonMaterial color="#263238" gradientMap={grad} />
        </mesh>
      ))}
      {/* LEDs */}
      <group ref={ledRef}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[0.2, 0.3 + i * 0.2, 0.22]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial color="#4CAF50" emissive="#4CAF50" emissiveIntensity={0.5} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── FramedPicture ───────────────────────────────────────────────────────────
export function FramedPicture() {

  return (
    <group>
      {/* Frame */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[0.8, 0.6, 0.05]} />
        <meshToonMaterial color="#5D4037" gradientMap={grad} />
      </mesh>
      {/* Sky */}
      <mesh position={[0, 1.58, 0.026]}>
        <planeGeometry args={[0.65, 0.2]} />
        <meshToonMaterial color="#87CEEB" gradientMap={grad} />
      </mesh>
      {/* Ground */}
      <mesh position={[0, 1.42, 0.026]}>
        <planeGeometry args={[0.65, 0.2]} />
        <meshToonMaterial color="#8BC34A" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// ─── Clock ───────────────────────────────────────────────────────────────────
export function Clock() {

  const hourRef = useRef<THREE.Mesh>(null);
  const minuteRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const now = new Date();
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    if (hourRef.current) {
      hourRef.current.rotation.z = -((hours + minutes / 60) / 12) * Math.PI * 2;
    }
    if (minuteRef.current) {
      minuteRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
  });

  return (
    <group>
      {/* Face */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.03, 16]} />
        <meshToonMaterial color="#FAFAFA" gradientMap={grad} />
      </mesh>
      {/* Frame ring */}
      <mesh position={[0, 1.5, 0]}>
        <torusGeometry args={[0.25, 0.02, 8, 16]} />
        <meshToonMaterial color="#424242" gradientMap={grad} />
      </mesh>
      {/* Hour hand */}
      <mesh ref={hourRef} position={[0, 1.5, 0.02]}>
        <boxGeometry args={[0.025, 0.14, 0.01]} />
        <meshToonMaterial color="#212121" gradientMap={grad} />
      </mesh>
      {/* Minute hand */}
      <mesh ref={minuteRef} position={[0, 1.5, 0.025]}>
        <boxGeometry args={[0.02, 0.2, 0.01]} />
        <meshToonMaterial color="#424242" gradientMap={grad} />
      </mesh>
    </group>
  );
}

// ─── Whiteboard ──────────────────────────────────────────────────────────────
export function Whiteboard() {

  return (
    <group>
      {/* Board */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[1.2, 0.8, 0.04]} />
        <meshToonMaterial color="#FAFAFA" gradientMap={grad} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 1.5, -0.01]}>
        <boxGeometry args={[1.25, 0.85, 0.02]} />
        <meshToonMaterial color="#9E9E9E" gradientMap={grad} />
      </mesh>
      {/* Writing lines */}
      {[1.7, 1.6, 1.5, 1.4].map((y, i) => (
        <mesh key={i} position={[-0.1 + i * 0.05, y, 0.025]}>
          <boxGeometry args={[0.8 - i * 0.1, 0.015, 0.005]} />
          <meshToonMaterial color={['#E53935', '#1E88E5', '#43A047', '#FDD835'][i]} gradientMap={grad} />
        </mesh>
      ))}
      {/* Marker tray */}
      <mesh position={[0, 1.05, 0.04]}>
        <boxGeometry args={[0.6, 0.04, 0.06]} />
        <meshToonMaterial color="#757575" gradientMap={grad} />
      </mesh>
      {/* Markers */}
      {[[-0.1, '#E53935'], [0.1, '#1E88E5']].map(([ox, color], i) => (
        <mesh key={i} position={[ox as number, 1.07, 0.05]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          <meshToonMaterial color={color as string} gradientMap={grad} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Decoration dispatcher ───────────────────────────────────────────────────
export function Decoration({ type, position }: { type: string; position: [number, number, number] }) {
  const Component = {
    plant: Plant,
    bookshelf: Bookshelf,
    lamp: Lamp,
    coffeeMachine: CoffeeMachine,
    serverRack: ServerRack,
    framedPicture: FramedPicture,
    clock: Clock,
    whiteboard: Whiteboard,
  }[type] || Plant;

  return (
    <group position={position}>
      <Component />
    </group>
  );
}

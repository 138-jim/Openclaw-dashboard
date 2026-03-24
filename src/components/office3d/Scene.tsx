'use client';

import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { AgentState, STATE_COLORS } from '@/lib/agents';
import { Conversation } from '@/lib/conversations';
import { SlackVisitor } from '@/lib/visitors';
import { H, GRID_W } from '@/lib/office-layout';
import Room from '@/components/office3d/Room';
import CorridorFloor from '@/components/office3d/CorridorFloor';
import BreakRoom from '@/components/office3d/BreakRoom';

export default function Scene({
  agents,
  conversations = [],
  visitors = [],
}: {
  agents: AgentState[];
  conversations?: Conversation[];
  visitors?: SlackVisitor[];
}) {
  const targetX = GRID_W / 2;
  const targetZ = H / 2;

  return (
    <div className="w-full relative" style={{ height: '600px' }}>
      <Canvas shadows>
        {/* Isometric-ish orthographic camera */}
        <OrthographicCamera makeDefault position={[targetX + 30, 25, targetZ + 30]} zoom={10} />
        <OrbitControls
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 3}
          minAzimuthAngle={-Math.PI / 4}
          maxAzimuthAngle={Math.PI / 4}
          enableDamping
          dampingFactor={0.05}
          target={[targetX, 0, targetZ]}
        />

        {/* Lighting */}
        <ambientLight intensity={0.5} color="#FFF5E6" />
        <directionalLight
          position={[30, 40, 20]}
          intensity={0.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        <hemisphereLight args={['#87CEEB', '#E8D5B7', 0.3]} />

        {/* Ground plane */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[GRID_W / 2, -0.01, H / 2]} receiveShadow>
          <planeGeometry args={[GRID_W + 4, H + 4]} />
          <meshStandardMaterial color="#D5CCC0" />
        </mesh>

        {/* Corridors */}
        <CorridorFloor />

        {/* Break room */}
        <BreakRoom />

        {/* Agent rooms */}
        {agents.map((a, i) => (
          <Room
            key={a.label}
            roomIndex={i}
            label={a.label}
            name={a.name}
            emoji={a.emoji}
            glowColor={STATE_COLORS[a.state]}
            isError={a.state === 'error'}
          />
        ))}
      </Canvas>
    </div>
  );
}

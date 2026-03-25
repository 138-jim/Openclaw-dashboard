// @ts-nocheck
'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AgentAnim3D } from '@/lib/agent-animation';
import { STATE_COLORS } from '@/lib/agents';
import { ACTIVE_STATES } from '@/lib/office-layout';

const SKIN_COLOR = '#FFCC80';
const PANTS_COLOR = '#3b3b5c';
const SHOE_COLOR = '#1a1a2e';

interface CharacterProps {
  anim: AgentAnim3D;
}

function HairMesh({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // Short: flat box on top
      return (
        <mesh position={[0, 1.08, 0]}>
          <boxGeometry args={[0.3, 0.06, 0.3]} />
          <meshToonMaterial color={color} />
        </mesh>
      );
    case 1: // Medium: larger box with front overhang
      return (
        <group>
          <mesh position={[0, 1.1, 0]}>
            <boxGeometry args={[0.35, 0.1, 0.35]} />
            <meshToonMaterial color={color} />
          </mesh>
          <mesh position={[0, 1.05, 0.12]}>
            <boxGeometry args={[0.3, 0.06, 0.1]} />
            <meshToonMaterial color={color} />
          </mesh>
        </group>
      );
    case 2: // Tall/mohawk
      return (
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[0.15, 0.2, 0.15]} />
          <meshToonMaterial color={color} />
        </mesh>
      );
    case 3: // Spiky: multiple small cones
      return (
        <group>
          {[[-0.08, 0], [0.08, 0], [0, 0.05], [0, -0.05]].map(([x, z], i) => (
            <mesh key={i} position={[x, 1.12, z]} rotation={[0, 0, 0]}>
              <coneGeometry args={[0.04, 0.12, 4]} />
              <meshToonMaterial color={color} />
            </mesh>
          ))}
        </group>
      );
    default:
      return null;
  }
}

const CHAR_SCALE = 1.5; // Scale up characters to be more visible

export default function Character({ anim }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const exclamationRef = useRef<THREE.Group>(null);

  // Smooth position tracking
  const smoothPos = useRef({ x: anim.x, z: anim.z });

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    const elapsed = clock.elapsedTime;

    // Smooth position interpolation
    const lerpFactor = 1 - Math.pow(0.001, delta);
    smoothPos.current.x += (anim.x - smoothPos.current.x) * lerpFactor;
    smoothPos.current.z += (anim.z - smoothPos.current.z) * lerpFactor;

    const bobY = anim.isWalking ? 0 : Math.sin(anim.bobPhase) * 0.03;

    let jumpY = 0;
    if (anim.state === 'error' && anim.errorTimer > 0) {
      jumpY = Math.abs(Math.sin(anim.errorTimer * 0.15)) * 0.2;
    }

    groupRef.current.position.set(
      smoothPos.current.x,
      bobY + jumpY,
      smoothPos.current.z
    );
    groupRef.current.scale.setScalar(CHAR_SCALE);

    if (anim.isWalking) {
      const dx = anim.targetX - smoothPos.current.x;
      const dz = anim.targetZ - smoothPos.current.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        const targetRot = Math.atan2(dx, dz);
        const currentRot = groupRef.current.rotation.y;
        groupRef.current.rotation.y = currentRot + (targetRot - currentRot) * lerpFactor;
      }
    }

    const walkSwing = Math.sin(anim.walkPhase) * 0.5;
    const isActive = ACTIVE_STATES.has(anim.state);
    const typingMotion = isActive ? Math.sin(elapsed * 8) * 0.15 : 0;

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = anim.isWalking ? walkSwing : typingMotion;
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = anim.isWalking ? -walkSwing : -typingMotion;
    }

    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = anim.isWalking ? -walkSwing : 0;
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = anim.isWalking ? walkSwing : 0;
    }

    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isActive ? 0.5 + Math.sin(elapsed * 5) * 0.2 : 0.5;
    }

    if (exclamationRef.current) {
      exclamationRef.current.visible = anim.state === 'error' && anim.errorTimer > 0;
    }
  });

  const stateColor = STATE_COLORS[anim.state] || STATE_COLORS.idle;

  return (
    <group ref={groupRef} position={[anim.x, 0, anim.z]}>
      {/* State indicator ring on ground */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <torusGeometry args={[0.3, 0.03, 8, 16]} />
        <meshBasicMaterial color={stateColor} transparent opacity={0.7} />
      </mesh>

      {/* Shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.2, 12]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.15} />
      </mesh>

      {/* Shoes */}
      <mesh position={[-0.08, 0.04, 0.02]}>
        <boxGeometry args={[0.08, 0.04, 0.12]} />
        <meshToonMaterial color={SHOE_COLOR} />
      </mesh>
      <mesh position={[0.08, 0.04, 0.02]}>
        <boxGeometry args={[0.08, 0.04, 0.12]} />
        <meshToonMaterial color={SHOE_COLOR} />
      </mesh>

      {/* Legs */}
      <mesh ref={leftLegRef} position={[-0.08, 0.2, 0]}>
        <capsuleGeometry args={[0.06, 0.25, 4, 8]} />
        <meshToonMaterial color={PANTS_COLOR} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.08, 0.2, 0]}>
        <capsuleGeometry args={[0.06, 0.25, 4, 8]} />
        <meshToonMaterial color={PANTS_COLOR} />
      </mesh>

      {/* Torso */}
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.15, 0.25, 4, 8]} />
        <meshToonMaterial color={anim.shirtColor} />
      </mesh>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[-0.22, 0.55, 0]}>
        <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
        <meshToonMaterial color={anim.shirtColor} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.22, 0.55, 0]}>
        <capsuleGeometry args={[0.05, 0.2, 4, 8]} />
        <meshToonMaterial color={anim.shirtColor} />
      </mesh>

      {/* Hands */}
      <mesh position={[-0.22, 0.38, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshToonMaterial color={SKIN_COLOR} />
      </mesh>
      <mesh position={[0.22, 0.38, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshToonMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshToonMaterial color={SKIN_COLOR} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.06, 0.96, 0.16]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>
      <mesh position={[0.06, 0.96, 0.16]}>
        <sphereGeometry args={[0.03, 8, 8]} />
        <meshBasicMaterial color="#1a1a2e" />
      </mesh>

      {/* Mouth */}
      {anim.state === 'error' ? (
        <mesh position={[0, 0.88, 0.16]}>
          <boxGeometry args={[0.06, 0.02, 0.01]} />
          <meshBasicMaterial color="#C62828" />
        </mesh>
      ) : (
        <mesh position={[0, 0.88, 0.16]}>
          <boxGeometry args={[0.06, 0.015, 0.01]} />
          <meshBasicMaterial color="#BF8B5E" />
        </mesh>
      )}

      {/* Hair */}
      <HairMesh style={anim.hairStyle} color={anim.hairColor} />

      {/* Error exclamation mark */}
      <group ref={exclamationRef} visible={false}>
        <Billboard position={[0, 1.5, 0]}>
          <Text fontSize={0.2} color="#ef4444" fontWeight="bold" outlineWidth={0.01} outlineColor="black">
            !
          </Text>
        </Billboard>
      </group>

      {/* Name label */}
      <Billboard position={[0, 1.4, 0]}>
        <Text
          fontSize={0.12}
          color="white"
          outlineWidth={0.01}
          outlineColor="black"
          anchorX="center"
          anchorY="bottom"
        >
          {anim.emoji} {anim.name}
        </Text>
      </Billboard>
    </group>
  );
}

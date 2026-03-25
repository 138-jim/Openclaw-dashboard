// @ts-nocheck
'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { VisitorAnim3D } from '@/lib/agent-animation';

const JEANS_COLOR = '#1a5276';
const SHOE_COLOR = '#2c3e50';

interface VisitorCharacterProps {
  anim: VisitorAnim3D;
}

export default function VisitorCharacter({ anim }: VisitorCharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);

  const smoothPos = useRef({ x: anim.x, z: anim.z });

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const lerpFactor = 1 - Math.pow(0.001, delta);
    smoothPos.current.x += (anim.x - smoothPos.current.x) * lerpFactor;
    smoothPos.current.z += (anim.z - smoothPos.current.z) * lerpFactor;

    const bobY = anim.isWalking ? 0 : Math.sin(anim.bobPhase) * 0.025;

    groupRef.current.position.set(
      smoothPos.current.x,
      bobY,
      smoothPos.current.z
    );

    // Face direction
    if (anim.isWalking) {
      const dx = anim.targetX - smoothPos.current.x;
      const dz = anim.targetZ - smoothPos.current.z;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        const targetRot = Math.atan2(dx, dz);
        const currentRot = groupRef.current.rotation.y;
        groupRef.current.rotation.y = currentRot + (targetRot - currentRot) * lerpFactor;
      }
    }

    // Walk animation
    const walkSwing = Math.sin(anim.walkPhase) * 0.5;
    if (leftArmRef.current) leftArmRef.current.rotation.x = anim.isWalking ? walkSwing : 0;
    if (rightArmRef.current) rightArmRef.current.rotation.x = anim.isWalking ? -walkSwing : 0;
    if (leftLegRef.current) leftLegRef.current.rotation.x = anim.isWalking ? -walkSwing : 0;
    if (rightLegRef.current) rightLegRef.current.rotation.x = anim.isWalking ? walkSwing : 0;
  });

  const badgeColor = anim.surface === 'slack' ? '#4A154B' : '#2196F3';
  const badgeLetter = anim.surface === 'slack' ? 'S' : 'W';
  const capColor = anim.shirtColor;

  return (
    <group ref={groupRef} position={[anim.x, 0, anim.z]}>
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

      {/* Legs (jeans) */}
      <mesh ref={leftLegRef} position={[-0.08, 0.2, 0]}>
        <capsuleGeometry args={[0.06, 0.25, 4, 8]} />
        <meshToonMaterial color={JEANS_COLOR} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.08, 0.2, 0]}>
        <capsuleGeometry args={[0.06, 0.25, 4, 8]} />
        <meshToonMaterial color={JEANS_COLOR} />
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
        <meshToonMaterial color={anim.skinColor} />
      </mesh>
      <mesh position={[0.22, 0.38, 0]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshToonMaterial color={anim.skinColor} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.95, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshToonMaterial color={anim.skinColor} />
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

      {/* Smile */}
      <mesh position={[0, 0.88, 0.16]}>
        <boxGeometry args={[0.06, 0.015, 0.01]} />
        <meshBasicMaterial color="#8B6914" />
      </mesh>

      {/* Cap (differentiates from agents) */}
      <mesh position={[0, 1.08, 0.02]}>
        <boxGeometry args={[0.36, 0.06, 0.36]} />
        <meshToonMaterial color={capColor} />
      </mesh>
      {/* Cap brim */}
      <mesh position={[0, 1.06, 0.2]}>
        <boxGeometry args={[0.3, 0.03, 0.12]} />
        <meshToonMaterial color={capColor} />
      </mesh>

      {/* Badge above head */}
      <Billboard position={[0, 1.3, 0]}>
        <mesh>
          <planeGeometry args={[0.2, 0.2]} />
          <meshBasicMaterial color={badgeColor} transparent opacity={0.9} />
        </mesh>
        <Text fontSize={0.12} color="white" anchorX="center" anchorY="middle" position={[0, 0, 0.01]}>
          {badgeLetter}
        </Text>
      </Billboard>

      {/* Name label */}
      <Billboard position={[0, 1.5, 0]}>
        <Text
          fontSize={0.1}
          color="white"
          outlineWidth={0.01}
          outlineColor="black"
          anchorX="center"
          anchorY="bottom"
        >
          {anim.name}
        </Text>
      </Billboard>
    </group>
  );
}

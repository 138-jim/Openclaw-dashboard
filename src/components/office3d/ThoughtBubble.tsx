// @ts-nocheck
'use client';

import React, { useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';

export default function ThoughtBubble({ text, color, position }) {
  const groupRef = useRef(null);
  const [size, setSize] = useState({ w: 4, h: 1.2 });

  useFrame(() => {
    if (!groupRef.current) return;
    const t = Date.now() * 0.002;
    groupRef.current.position.y = position[1] + Math.sin(t) * 0.08;
  });

  const handleSync = useCallback((troika) => {
    if (!troika?.geometry?.boundingBox) {
      troika.geometry.computeBoundingBox();
    }
    const bb = troika.geometry.boundingBox;
    if (bb) {
      const w = (bb.max.x - bb.min.x) + 0.8;
      const h = (bb.max.y - bb.min.y) + 0.6;
      setSize({ w: Math.max(w, 2), h: Math.max(h, 0.8) });
    }
  }, []);

  if (!text) return null;

  return (
    <group ref={groupRef} position={position}>
      {/* Trailing dots */}
      <mesh position={[0, -size.h / 2 - 0.25, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color="white" transparent opacity={0.85} />
      </mesh>
      <mesh position={[-0.15, -size.h / 2 - 0.1, 0]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="white" transparent opacity={0.85} />
      </mesh>

      <Billboard>
        {/* Background sized to text */}
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[size.w, size.h]} />
          <meshBasicMaterial color="white" transparent opacity={0.93} />
        </mesh>
        <mesh position={[0, 0, -0.03]}>
          <planeGeometry args={[size.w + 0.1, size.h + 0.1]} />
          <meshBasicMaterial color={color} transparent opacity={0.3} />
        </mesh>

        <Text
          fontSize={0.25}
          color="#111111"
          maxWidth={10}
          lineHeight={1.3}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
          outlineWidth={0.015}
          outlineColor="#FFFFFF"
          onSync={handleSync}
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

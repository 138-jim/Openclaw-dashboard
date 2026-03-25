// @ts-nocheck
'use client';

import React, { useRef, useState, useCallback, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

function TailTriangle({ color }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.15, 0);
    shape.lineTo(0, -0.3);
    shape.lineTo(0.15, 0);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  return (
    <mesh geometry={geometry} position={[0, 0, -0.01]}>
      <meshBasicMaterial color={color} />
    </mesh>
  );
}

export default function SpeechBubble({ text, color, position }) {
  const groupRef = useRef(null);
  const [size, setSize] = useState({ w: 3, h: 1 });

  useFrame(() => {
    if (!groupRef.current) return;
    const t = Date.now() * 0.002;
    groupRef.current.position.y = position[1] + Math.sin(t) * 0.05;
  });

  const handleSync = useCallback((troika) => {
    if (!troika?.geometry?.boundingBox) {
      troika.geometry.computeBoundingBox();
    }
    const bb = troika.geometry.boundingBox;
    if (bb) {
      const w = (bb.max.x - bb.min.x) + 0.7;
      const h = (bb.max.y - bb.min.y) + 0.5;
      setSize({ w: Math.max(w, 2), h: Math.max(h, 0.8) });
    }
  }, []);

  if (!text) return null;

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[size.w, size.h]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} />
        </mesh>

        <group position={[0, -size.h / 2, 0]}>
          <TailTriangle color={color} />
        </group>

        <Text
          fontSize={0.23}
          color="white"
          maxWidth={8}
          lineHeight={1.3}
          anchorX="center"
          anchorY="middle"
          textAlign="center"
          outlineWidth={0.008}
          outlineColor="#000000"
          onSync={handleSync}
        >
          {text}
        </Text>
      </Billboard>
    </group>
  );
}

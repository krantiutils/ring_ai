"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Mesh } from "three";

interface Props {
  color: string;
  height: number;
}

export default function PricingPedestal({ color, height }: Props) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    ref.current.position.y =
      -0.3 + Math.sin(state.clock.elapsedTime * 0.6) * 0.03;
  });

  return (
    <group>
      <RoundedBox
        ref={ref}
        args={[0.8, height, 0.8]}
        radius={0.08}
        smoothness={4}
        position={[0, -0.3, 0]}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
      {/* Small crown/star on top for decoration */}
      <mesh position={[0, height * 0.5 - 0.1, 0]}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshStandardMaterial
          color="#FFF8F0"
          roughness={0.7}
          metalness={0.1}
          flatShading
        />
      </mesh>
    </group>
  );
}

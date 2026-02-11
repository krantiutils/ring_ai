"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group, Mesh, MeshStandardMaterial } from "three";

export default function ClayPhone() {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.1;
  });

  return (
    <group ref={groupRef}>
      {/* Phone body */}
      <RoundedBox args={[1.4, 2.6, 0.2]} radius={0.15} smoothness={4}>
        <meshStandardMaterial
          color="#2D2D2D"
          roughness={0.8}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>

      {/* Screen */}
      <RoundedBox
        args={[1.15, 2.2, 0.05]}
        radius={0.1}
        smoothness={4}
        position={[0, 0, 0.13]}
      >
        <meshStandardMaterial
          color="#4ECDC4"
          roughness={0.5}
          metalness={0.1}
          flatShading
          emissive="#4ECDC4"
          emissiveIntensity={0.15}
        />
      </RoundedBox>

      {/* Sound waves */}
      {[0.9, 1.3, 1.7].map((radius, i) => (
        <SoundWave key={i} radius={radius} delay={i * 0.3} />
      ))}
    </group>
  );
}

function SoundWave({ radius, delay }: { radius: number; delay: number }) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime + delay) % 2;
    const scale = 0.5 + t * 0.5;
    const opacity = Math.max(0, 1 - t / 2);
    ref.current.scale.set(scale, scale, 1);
    (ref.current.material as MeshStandardMaterial).opacity = opacity * 0.4;
  });

  return (
    <mesh ref={ref} position={[1.2, 0, 0]} rotation={[0, 0, 0]}>
      <torusGeometry args={[radius, 0.04, 8, 32, Math.PI]} />
      <meshStandardMaterial
        color="#FF6B6B"
        transparent
        opacity={0.4}
        roughness={0.9}
        flatShading
      />
    </mesh>
  );
}

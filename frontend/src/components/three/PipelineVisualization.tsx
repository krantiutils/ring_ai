"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, Text } from "@react-three/drei";
import type { Group, Mesh } from "three";

export default function PipelineVisualization() {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.3) * 0.08;
  });

  return (
    <group ref={groupRef} position={[0, -0.3, 0]}>
      {/* Interactive pipeline (top) */}
      <group position={[0, 0.7, 0]}>
        <Text
          position={[-2.5, 0.5, 0]}
          fontSize={0.18}
          color="#FF6B6B"
          font={undefined}
          anchorX="left"
        >
          Interactive Agent
        </Text>
        <Tube
          position={[0, 0, 0]}
          color="#FF6B6B"
          length={4}
        />
        {/* Data packets flowing through */}
        <FlowingPacket color="#FF6B6B" yPos={0} speed={1} offset={0} />
        <FlowingPacket color="#FF6B6B" yPos={0} speed={1} offset={1.5} />
      </group>

      {/* Broadcast pipeline (bottom) */}
      <group position={[0, -0.5, 0]}>
        <Text
          position={[-2.5, 0.5, 0]}
          fontSize={0.18}
          color="#4ECDC4"
          font={undefined}
          anchorX="left"
        >
          Broadcast Engine
        </Text>
        <Tube
          position={[0, 0, 0]}
          color="#4ECDC4"
          length={4}
        />
        {/* Multiple packets for broadcast */}
        <FlowingPacket color="#4ECDC4" yPos={0} speed={1.3} offset={0} />
        <FlowingPacket color="#4ECDC4" yPos={0} speed={1.3} offset={0.7} />
        <FlowingPacket color="#4ECDC4" yPos={0} speed={1.3} offset={1.4} />
      </group>

      {/* Center merge node */}
      <RoundedBox
        args={[0.6, 0.6, 0.6]}
        radius={0.15}
        smoothness={4}
        position={[2.5, 0.1, 0]}
      >
        <meshStandardMaterial
          color="#FFD93D"
          roughness={0.8}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
      <Text
        position={[2.5, -0.55, 0]}
        fontSize={0.14}
        color="#2D2D2D"
        font={undefined}
        anchorX="center"
      >
        Analytics
      </Text>
    </group>
  );
}

function Tube({
  position,
  color,
  length,
}: {
  position: [number, number, number];
  color: string;
  length: number;
}) {
  return (
    <mesh position={position} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.12, 0.12, length, 12]} />
      <meshStandardMaterial
        color={color}
        roughness={0.85}
        metalness={0.05}
        flatShading
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

function FlowingPacket({
  color,
  yPos,
  speed,
  offset,
}: {
  color: string;
  yPos: number;
  speed: number;
  offset: number;
}) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = ((state.clock.elapsedTime * speed + offset) % 3) - 1.5;
    ref.current.position.x = t * 1.3;
    ref.current.position.y = yPos;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.08, 8, 8]} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        metalness={0.1}
        flatShading
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

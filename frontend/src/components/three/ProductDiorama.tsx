"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";

type DioramaType = "voice" | "text" | "forms";

interface ProductDioramaProps {
  type: DioramaType;
  color: string;
}

export default function ProductDiorama({ type, color }: ProductDioramaProps) {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
    groupRef.current.position.y =
      Math.sin(state.clock.elapsedTime * 0.6) * 0.05;
  });

  return (
    <group ref={groupRef}>
      {type === "voice" && <VoiceDiorama color={color} />}
      {type === "text" && <TextDiorama color={color} />}
      {type === "forms" && <FormsDiorama color={color} />}
    </group>
  );
}

function VoiceDiorama({ color }: { color: string }) {
  return (
    <group>
      {/* Clay phone */}
      <RoundedBox args={[0.8, 1.4, 0.12]} radius={0.08} smoothness={4}>
        <meshStandardMaterial
          color="#2D2D2D"
          roughness={0.85}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>

      {/* Screen */}
      <RoundedBox
        args={[0.6, 1.1, 0.04]}
        radius={0.06}
        smoothness={4}
        position={[0, 0, 0.08]}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.5}
          metalness={0.1}
          flatShading
          emissive={color}
          emissiveIntensity={0.1}
        />
      </RoundedBox>

      {/* Speech bubbles */}
      <SpeechBubble position={[0.7, 0.5, 0.1]} scale={0.7} color="#FFF8F0" />
      <SpeechBubble position={[-0.6, -0.2, 0.1]} scale={0.5} color={color} />
    </group>
  );
}

function TextDiorama({ color }: { color: string }) {
  return (
    <group>
      {/* Stacked message cards */}
      {[0, 0.25, 0.5].map((yOff, i) => (
        <RoundedBox
          key={i}
          args={[1.2, 0.5, 0.08]}
          radius={0.06}
          smoothness={4}
          position={[i * 0.05, yOff - 0.25, i * 0.1]}
          rotation={[0, 0, i * 0.02]}
        >
          <meshStandardMaterial
            color={i === 2 ? color : "#FFFFFF"}
            roughness={0.85}
            metalness={0.05}
            flatShading
          />
        </RoundedBox>
      ))}

      {/* Text lines on cards */}
      {[0, 0.25, 0.5].map((yOff, i) => (
        <group key={`lines-${i}`} position={[0, yOff - 0.25, i * 0.1 + 0.06]}>
          <RoundedBox
            args={[0.8, 0.06, 0.02]}
            radius={0.02}
            smoothness={2}
            position={[-0.1, 0.08, 0]}
          >
            <meshStandardMaterial
              color={i === 2 ? "#FFFFFF" : "#E0E0E0"}
              roughness={0.9}
              flatShading
            />
          </RoundedBox>
          <RoundedBox
            args={[0.5, 0.06, 0.02]}
            radius={0.02}
            smoothness={2}
            position={[-0.25, -0.06, 0]}
          >
            <meshStandardMaterial
              color={i === 2 ? "#FFFFFF" : "#E0E0E0"}
              roughness={0.9}
              flatShading
            />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}

function FormsDiorama({ color }: { color: string }) {
  return (
    <group>
      {/* Clipboard */}
      <RoundedBox args={[1.1, 1.5, 0.1]} radius={0.06} smoothness={4}>
        <meshStandardMaterial
          color="#F5E6D0"
          roughness={0.9}
          metalness={0.02}
          flatShading
        />
      </RoundedBox>

      {/* Clipboard clip */}
      <RoundedBox
        args={[0.4, 0.15, 0.12]}
        radius={0.04}
        smoothness={4}
        position={[0, 0.8, 0.05]}
      >
        <meshStandardMaterial
          color="#C0A882"
          roughness={0.7}
          metalness={0.15}
          flatShading
        />
      </RoundedBox>

      {/* Checkmark rows */}
      {[-0.3, 0, 0.3].map((yOff, i) => (
        <group key={i} position={[0, yOff, 0.08]}>
          {/* Checkbox */}
          <RoundedBox
            args={[0.18, 0.18, 0.04]}
            radius={0.03}
            smoothness={2}
            position={[-0.35, 0, 0]}
          >
            <meshStandardMaterial
              color={i < 2 ? color : "#E0E0E0"}
              roughness={0.85}
              flatShading
            />
          </RoundedBox>
          {/* Line */}
          <RoundedBox
            args={[0.5, 0.08, 0.03]}
            radius={0.02}
            smoothness={2}
            position={[0.1, 0, 0]}
          >
            <meshStandardMaterial
              color="#D0D0D0"
              roughness={0.9}
              flatShading
            />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
}

function SpeechBubble({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: number;
  color: string;
}) {
  return (
    <group position={position} scale={scale}>
      <RoundedBox args={[0.7, 0.4, 0.08]} radius={0.1} smoothness={4}>
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
    </group>
  );
}

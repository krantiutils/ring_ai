"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";

type UseCaseType = "banking" | "healthcare" | "telecom";

interface Props {
  type: UseCaseType;
  color: string;
}

export default function UseCaseDiorama({ type, color }: Props) {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y =
      Math.sin(state.clock.elapsedTime * 0.35) * 0.2;
    groupRef.current.position.y =
      Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
  });

  return (
    <group ref={groupRef}>
      {/* Base platform */}
      <RoundedBox
        args={[2.5, 0.15, 2]}
        radius={0.05}
        smoothness={4}
        position={[0, -0.8, 0]}
      >
        <meshStandardMaterial
          color="#F5F0EB"
          roughness={0.9}
          metalness={0.02}
          flatShading
        />
      </RoundedBox>

      {type === "banking" && <BankingScene color={color} />}
      {type === "healthcare" && <HealthcareScene color={color} />}
      {type === "telecom" && <TelecomScene color={color} />}
    </group>
  );
}

function BankingScene({ color }: { color: string }) {
  return (
    <group>
      {/* Bank building */}
      <RoundedBox
        args={[1, 1.2, 0.8]}
        radius={0.05}
        smoothness={4}
        position={[-0.4, -0.1, 0]}
      >
        <meshStandardMaterial
          color="#F0E6FF"
          roughness={0.85}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
      {/* Pillars */}
      {[-0.7, -0.1].map((x, i) => (
        <mesh key={i} position={[x, -0.1, 0.45]}>
          <cylinderGeometry args={[0.06, 0.06, 1.1, 8]} />
          <meshStandardMaterial
            color="#E0D6EE"
            roughness={0.85}
            flatShading
          />
        </mesh>
      ))}
      {/* Roof triangle */}
      <mesh position={[-0.4, 0.7, 0]} rotation={[0, 0, 0]}>
        <coneGeometry args={[0.7, 0.4, 4]} />
        <meshStandardMaterial
          color="#E0D6EE"
          roughness={0.85}
          flatShading
        />
      </mesh>
      {/* Phone */}
      <RoundedBox
        args={[0.35, 0.6, 0.06]}
        radius={0.04}
        smoothness={4}
        position={[0.7, 0, 0.2]}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.8}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
    </group>
  );
}

function HealthcareScene({ color }: { color: string }) {
  return (
    <group>
      {/* Hospital building */}
      <RoundedBox
        args={[1, 1.4, 0.8]}
        radius={0.05}
        smoothness={4}
        position={[-0.3, 0, 0]}
      >
        <meshStandardMaterial
          color="#E8F5E9"
          roughness={0.85}
          metalness={0.05}
          flatShading
        />
      </RoundedBox>
      {/* Cross */}
      <RoundedBox
        args={[0.35, 0.1, 0.1]}
        radius={0.02}
        smoothness={2}
        position={[-0.3, 0.5, 0.45]}
      >
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </RoundedBox>
      <RoundedBox
        args={[0.1, 0.35, 0.1]}
        radius={0.02}
        smoothness={2}
        position={[-0.3, 0.5, 0.45]}
      >
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </RoundedBox>
      {/* Stethoscope-like shape */}
      <mesh position={[0.7, 0.1, 0.2]}>
        <torusGeometry args={[0.2, 0.04, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function TelecomScene({ color }: { color: string }) {
  return (
    <group>
      {/* Tower */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.06, 0.12, 2, 8]} />
        <meshStandardMaterial
          color="#AAA"
          roughness={0.7}
          metalness={0.2}
          flatShading
        />
      </mesh>
      {/* Tower dishes */}
      {[0.4, 0, -0.4].map((y, i) => (
        <RoundedBox
          key={i}
          args={[0.5, 0.08, 0.15]}
          radius={0.03}
          smoothness={2}
          position={[0.15 * (i % 2 === 0 ? 1 : -1), y + 0.5, 0]}
          rotation={[0, 0, (i % 2 === 0 ? 1 : -1) * 0.2]}
        >
          <meshStandardMaterial color={color} roughness={0.85} flatShading />
        </RoundedBox>
      ))}
      {/* Signal waves */}
      {[0.4, 0.6, 0.8].map((r, i) => (
        <mesh
          key={i}
          position={[0.5, 0.8, 0]}
          rotation={[0, 0, -Math.PI / 4]}
        >
          <torusGeometry args={[r, 0.02, 8, 16, Math.PI / 2]} />
          <meshStandardMaterial
            color={color}
            roughness={0.85}
            flatShading
            transparent
            opacity={0.5 - i * 0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

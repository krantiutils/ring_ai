"use client";

import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { Suspense, type ReactNode } from "react";

interface ClaySceneProps {
  children: ReactNode;
  className?: string;
  camera?: { position: [number, number, number]; fov: number };
}

export default function ClayScene({
  children,
  className = "",
  camera = { position: [0, 0, 5], fov: 45 },
}: ClaySceneProps) {
  return (
    <div className={`w-full h-full ${className}`}>
      <Canvas camera={camera} dpr={[1, 1.5]}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} color="#FFF8F0" />
          <directionalLight
            position={[-3, 3, 2]}
            intensity={0.4}
            color="#F0E6FF"
          />
          <Environment preset="studio" environmentIntensity={0.3} />
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
}

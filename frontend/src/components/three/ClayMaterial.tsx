"use client";

import { MeshStandardMaterial } from "three";
import { useMemo } from "react";

interface ClayMaterialProps {
  color?: string;
  roughness?: number;
}

export function useClayMaterial({ color = "#FF6B6B", roughness = 0.85 }: ClayMaterialProps = {}) {
  return useMemo(() => {
    const mat = new MeshStandardMaterial({
      color,
      roughness,
      metalness: 0.05,
      flatShading: true,
    });
    return mat;
  }, [color, roughness]);
}

export default function ClayMesh({
  color = "#FF6B6B",
  roughness = 0.85,
  children,
  ...props
}: ClayMaterialProps & { children: React.ReactNode } & Record<string, unknown>) {
  return (
    <mesh {...props}>
      {children}
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={0.05}
        flatShading
      />
    </mesh>
  );
}

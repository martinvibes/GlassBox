"use client";
import dynamic from "next/dynamic";
import Landing from "@/components/Landing";

// WebGL component — client only (no SSR).
const RippleGrid = dynamic(() => import("@/components/RippleGrid"), { ssr: false });

// Landing variant — RippleGrid hero background.
export default function Page() {
  return (
    <Landing
      background={
        <div className="absolute inset-0 pointer-events-none" style={{ height: "120%" }}>
          <RippleGrid
            gridColor="#4ee6a8"
            enableRainbow={false}
            rippleIntensity={0.045}
            gridSize={9}
            gridThickness={13}
            fadeDistance={1.6}
            vignetteStrength={2.4}
            glowIntensity={0.12}
            opacity={0.55}
            mouseInteraction
            mouseInteractionRadius={1.1}
          />
        </div>
      }
    />
  );
}

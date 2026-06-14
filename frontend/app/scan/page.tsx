"use client";
import dynamic from "next/dynamic";
import Landing from "@/components/Landing";

// WebGL + face-api component — client only (no SSR).
const GridScan = dynamic(() => import("@/components/GridScan"), { ssr: false });

// Landing variant — GridScan hero background (no webcam; pure animated scan grid).
export default function Page() {
  return (
    <Landing
      background={
        <div className="absolute inset-0 pointer-events-none" style={{ height: "120%" }}>
          <GridScan
            enableWebcam={false}
            sensitivity={0.5}
            lineThickness={1}
            linesColor="#1f3a30"
            gridScale={0.1}
            scanColor="#4ee6a8"
            scanOpacity={0.5}
            scanDirection="forward"
            enablePost
            bloomIntensity={0.5}
            chromaticAberration={0.0015}
            noiseIntensity={0.012}
          />
        </div>
      }
    />
  );
}

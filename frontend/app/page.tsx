"use client";
import dynamic from "next/dynamic";
import Landing from "@/components/Landing";

// WebGL + scan grid hero — client only (no SSR).
const GridScan = dynamic(() => import("@/components/GridScan"), { ssr: false });

export default function Page() {
  return (
    <Landing
      background={
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
      }
    />
  );
}

"use client";

import { useState, useRef } from "react";
import { AudioWaveform } from "./audio-waveform";  // ← Import

export function VideoPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        onPlay={() => setIsPlaying(true)}        // ← Start animation
        onPause={() => setIsPlaying(false)}      // ← Stop animation
        controls
        className="w-full rounded-lg"
      >
        <source src="video.mp4" type="video/mp4" />
      </video>

      <AudioWaveform isPlaying={isPlaying} />   {/* ← Add waveform */}
    </div>
  );
}
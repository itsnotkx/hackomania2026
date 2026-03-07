"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";

interface AudioWaveformProps {
  isPlaying?: boolean;
}

export function AudioWaveform({
  isPlaying = false,
}: AudioWaveformProps) {
  // Create 30 bars (static array, just for rendering)
  const barCount = 12;
  const [heights, setHeights] = useState<string[]>(
    Array(barCount).fill("6px"),
  );

  useEffect(() => {
    // Stop animation when not playing
    if (!isPlaying) {
      setHeights(Array(barCount).fill("6px"));
      return;
    }

    // Only animate when playing
    const interval = setInterval(() => {
      const time = Date.now() * 0.005; // Adjust speed
      const newHeights = Array.from({ length: barCount }, (_, index) => {
        const wave = Math.sin(time + index * 0.8) * 0.5 + 0.5; // 0 to 1
        const height = wave * 7.5; // 0 to 7.5px (reduced amplitude)
        return `${height}px`;
      });
      setHeights(newHeights);
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [isPlaying, barCount]);

  return (
    <div className={cn("flex h-14 items-center justify-center gap-1")}>
      {heights.map((height, index) => (
        <motion.div
          key={index}
          className={cn("w-1 rounded-full bg-success transition-colors")}
          animate={{ height }}
          transition={{
            duration: 0.1,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}
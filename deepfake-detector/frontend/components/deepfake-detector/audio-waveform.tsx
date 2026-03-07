"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AudioWaveformProps {
  levels: number[];
  isActive?: boolean;
}

export function AudioWaveform({
  levels,
  isActive = false,
}: AudioWaveformProps) {
  // Show only every 3rd bar (1/3 of the bars)
  const filteredLevels = levels.filter((_, i) => i % 3 === 0);

  return (
    <div className={cn("flex h-14 items-center justify-center gap-1")}>
      {filteredLevels.map((level, index) => (
        <motion.div
          key={index}
          className={cn(
            "w-1 rounded-full transition-colors",
            isActive ? "bg-success" : "bg-muted-foreground/30",
          )}
          animate={{
            height: isActive ? `${Math.max(6, level * 56)}px` : "6px",
          }}
          transition={{
            duration: 0.08,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

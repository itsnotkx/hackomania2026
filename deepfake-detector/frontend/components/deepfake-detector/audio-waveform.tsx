"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface AudioWaveformProps {
  levels: number[]
  isActive?: boolean
}

export function AudioWaveform({ levels, isActive = false }: AudioWaveformProps) {
  return (
    <div
      className={cn(
        "flex h-20 items-center justify-center gap-[3px] rounded-xl px-4 transition-colors",
        isActive ? "bg-success/5 border border-success/20" : "bg-secondary/50 border border-border"
      )}
    >
      {levels.map((level, index) => (
        <motion.div
          key={index}
          className={cn(
            "w-1.5 rounded-full transition-colors",
            isActive ? "bg-success" : "bg-muted-foreground/30"
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
  )
}

"use client"

import { motion } from "framer-motion"
import { Shield, Mic, FileAudio, Zap, Lock, Clock } from "lucide-react"

export function HeroSection() {
  return (
    <div className="relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2310b981' fill-opacity='0.08'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-24 lg:py-32">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex justify-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
            <Shield className="h-4 w-4" />
            <span>AI-Powered Audio Verification</span>
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-balance text-center text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Detect Deepfake Audio
          <br />
          <span className="text-primary">in Real-Time</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mx-auto mt-6 max-w-2xl text-pretty text-center text-lg text-muted-foreground"
        >
          Protect yourself from AI-generated voice scams during live calls. 
          Our advanced detection analyzes audio in 2-second snippets to identify 
          synthetic speech patterns instantly.
        </motion.p>

        {/* Feature Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <FeatureCard
            icon={Mic}
            title="Live Call Monitoring"
            description="Record and analyze audio during live calls with real-time feedback"
          />
          <FeatureCard
            icon={FileAudio}
            title="Recording Analysis"
            description="Upload audio files for comprehensive deepfake detection"
          />
          <FeatureCard
            icon={Zap}
            title="Instant Results"
            description="Get verdict and confidence scores within seconds"
          />
          <FeatureCard
            icon={Lock}
            title="Privacy First"
            description="Audio is processed securely and never stored"
          />
          <FeatureCard
            icon={Clock}
            title="2-Second Snippets"
            description="Continuous analysis of small audio chunks for accuracy"
          />
          <FeatureCard
            icon={Shield}
            title="Detailed Pointers"
            description="Understand why audio is flagged with specific indicators"
          />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 text-center"
        >
          <p className="text-muted-foreground">
            Click the shield icon in the bottom-right corner to start
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-primary" />
            </span>
            <span className="text-sm text-primary">DeepGuard is ready</span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="group rounded-xl border border-border bg-card/50 p-5 transition-colors hover:border-primary/30 hover:bg-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

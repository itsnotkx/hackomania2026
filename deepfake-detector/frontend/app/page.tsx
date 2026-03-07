import { DetectorOverlay } from "@/components/deepfake-detector/detector-overlay"
import { HeroSection } from "@/components/hero-section"

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <HeroSection />
      <DetectorOverlay />
    </main>
  )
}

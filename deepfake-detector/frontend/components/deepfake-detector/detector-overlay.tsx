"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  X,
  RotateCcw,
  History,
  Settings,
  Power,
  Flag,
  Ban,
  Phone,
  Clock,
  ChevronLeft,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { AnalysisResult } from "./analysis-result"
import { AudioWaveform } from "./audio-waveform"

type DetectorState = "idle" | "monitoring" | "analyzing" | "result"
type Verdict = "real" | "fake" | "uncertain"

interface AnalysisPointer {
  type: "warning" | "safe" | "neutral"
  label: string
  description: string
}

interface AnalysisData {
  verdict: Verdict
  confidence: number
  snippetsAnalyzed: number
  duration: number
  pointers: AnalysisPointer[]
}

interface CallHistoryItem {
  id: string
  analysis: AnalysisData
  callerInfo: string
  timestamp: Date
  isBlocked: boolean
  isReported: boolean
}

export function DetectorOverlay() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [state, setState] = useState<DetectorState>("idle")
  const [isActive, setIsActive] = useState(false)
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [monitoringTime, setMonitoringTime] = useState(0)
  const [snippetsCount, setSnippetsCount] = useState(0)
  const [audioLevels, setAudioLevels] = useState<number[]>(Array(24).fill(0.05))
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<CallHistoryItem | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const snippetIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  const updateAudioLevels = useCallback(() => {
    if (analyserRef.current && isActive) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
      analyserRef.current.getByteFrequencyData(dataArray)
      
      const levels: number[] = []
      const step = Math.floor(dataArray.length / 24)
      for (let i = 0; i < 24; i++) {
        const value = dataArray[i * step] / 255
        levels.push(Math.max(0.05, value))
      }
      setAudioLevels(levels)
      animationFrameRef.current = requestAnimationFrame(updateAudioLevels)
    }
  }, [isActive])

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)
      analyserRef.current.fftSize = 256

      setIsActive(true)
      setState("monitoring")
      setMonitoringTime(0)
      setSnippetsCount(0)
      setAnalysisData(null)

      timerRef.current = setInterval(() => {
        setMonitoringTime((prev) => prev + 1)
      }, 1000)

      // Send 2-second audio snippets to backend for analysis
      snippetIntervalRef.current = setInterval(() => {
        setSnippetsCount((prev) => {
          const newCount = prev + 1
          // Simulate periodic analysis results coming back
          if (newCount % 3 === 0) {
            simulateAnalysisUpdate(newCount)
          }
          return newCount
        })
      }, 2000)

      updateAudioLevels()
    } catch (error) {
      console.error("Error accessing microphone:", error)
      setIsActive(false)
    }
  }

  const simulateAnalysisUpdate = (snippetCount: number) => {
    // Simulate backend returning analysis results
    // Replace this with actual API response handling
    const verdicts: Verdict[] = ["real", "fake", "uncertain"]
    const randomVerdict = verdicts[Math.floor(Math.random() * 3)]
    
    setAnalysisData({
      verdict: randomVerdict,
      confidence: 60 + Math.random() * 35,
      snippetsAnalyzed: snippetCount,
      duration: snippetCount * 2,
      pointers: generatePointers(randomVerdict),
    })
    setState("result")
  }

  const generatePointers = (verdict: Verdict): AnalysisPointer[] => {
    if (verdict === "fake") {
      return [
        {
          type: "warning",
          label: "Pitch Anomalies",
          description: "Unnatural pitch transitions detected in speech patterns",
        },
        {
          type: "warning",
          label: "Spectral Artifacts",
          description: "AI-generated spectral signatures found in audio",
        },
        {
          type: "neutral",
          label: "Background Analysis",
          description: "Background noise patterns are inconclusive",
        },
      ]
    } else if (verdict === "real") {
      return [
        {
          type: "safe",
          label: "Natural Prosody",
          description: "Speech rhythm and intonation appear natural",
        },
        {
          type: "safe",
          label: "Authentic Timbre",
          description: "Voice characteristics consistent with human speech",
        },
        {
          type: "safe",
          label: "Clean Spectrum",
          description: "No synthetic artifacts detected in frequency analysis",
        },
      ]
    }
    return [
      {
        type: "neutral",
        label: "Inconclusive Patterns",
        description: "Audio quality insufficient for definitive analysis",
      },
      {
        type: "neutral",
        label: "Mixed Signals",
        description: "Some indicators suggest both natural and synthetic elements",
      },
    ]
  }

  const stopMonitoring = () => {
    setIsActive(false)
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    if (snippetIntervalRef.current) {
      clearInterval(snippetIntervalRef.current)
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    setAudioLevels(Array(24).fill(0.05))
    
    // Save to call history when stopping with analysis results
    if (analysisData && snippetsCount > 0) {
      const newHistoryItem: CallHistoryItem = {
        id: Date.now().toString(),
        analysis: analysisData,
        callerInfo: "+1 (555) " + Math.floor(100 + Math.random() * 900) + "-" + Math.floor(1000 + Math.random() * 9000), // Simulated caller ID
        timestamp: new Date(),
        isBlocked: false,
        isReported: false,
      }
      setCallHistory(prev => [newHistoryItem, ...prev])
    }
    
    setState("idle")
    setAnalysisData(null)
  }

  const toggleMonitoring = () => {
    if (isActive) {
      stopMonitoring()
    } else {
      startMonitoring()
    }
  }

  const resetAnalysis = () => {
    if (isActive) {
      stopMonitoring()
    }
    setState("idle")
    setAnalysisData(null)
    setMonitoringTime(0)
    setSnippetsCount(0)
  }

  const handleReport = (itemId: string) => {
    setCallHistory(prev => prev.map(item => 
      item.id === itemId ? { ...item, isReported: true } : item
    ))
  }

  const handleBlock = (itemId: string) => {
    setCallHistory(prev => prev.map(item => 
      item.id === itemId ? { ...item, isBlocked: true } : item
    ))
  }

  const handleDeleteHistoryItem = (itemId: string) => {
    setCallHistory(prev => prev.filter(item => item.id !== itemId))
    if (selectedHistoryItem?.id === itemId) {
      setSelectedHistoryItem(null)
    }
  }

  const clearAllHistory = () => {
    setCallHistory([])
    setSelectedHistoryItem(null)
  }

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (date: Date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const getLastCall = () => callHistory[0] || null

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (snippetIntervalRef.current) clearInterval(snippetIntervalRef.current)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
      if (audioContextRef.current) audioContextRef.current.close()
      if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const getStateIcon = () => {
    if (state === "result" && analysisData) {
      if (analysisData.verdict === "real") return <ShieldCheck className="h-5 w-5" />
      if (analysisData.verdict === "fake") return <ShieldAlert className="h-5 w-5" />
      return <ShieldQuestion className="h-5 w-5" />
    }
    return <Shield className="h-5 w-5" />
  }

  const getBubbleColor = () => {
    if (state === "result" && analysisData) {
      switch (analysisData.verdict) {
        case "real":
          return "bg-success/20 border-success/50 text-success"
        case "fake":
          return "bg-danger/20 border-danger/50 text-danger"
        case "uncertain":
          return "bg-warning/20 border-warning/50 text-warning"
      }
    }
    if (isActive) {
      return "bg-success/20 border-success/50 text-success"
    }
    return "bg-muted/50 border-border text-muted-foreground"
  }

  const getStatusText = () => {
    if (state === "result" && analysisData) return "Analysis available"
    if (isActive) return "Monitoring active"
    return "Inactive"
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          <motion.button
            key="bubble"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsExpanded(true)}
            className={cn(
              "relative flex h-14 w-14 items-center justify-center rounded-full border-2 backdrop-blur-sm transition-colors",
              getBubbleColor()
            )}
          >
            {getStateIcon()}
            {isActive && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-success"
                animate={{ scale: [1, 1.2], opacity: [0.6, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.button>
        ) : (
          <motion.div
            key="panel"
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            className="flex max-h-[calc(100vh-3rem)] w-80 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-secondary/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className={cn("rounded-lg p-1.5", getBubbleColor())}>
                  {getStateIcon()}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">DeepGuard</h3>
                  <p className="text-xs text-muted-foreground">{getStatusText()}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "h-8 w-8 relative",
                    showHistory ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="h-4 w-4" />
                  {callHistory.length > 0 && !showHistory && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                      {callHistory.length > 9 ? '9+' : callHistory.length}
                    </span>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsExpanded(false)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4">
              <AnimatePresence mode="wait">
                {showHistory ? (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-3"
                  >
                    {/* History Header */}
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          setShowHistory(false)
                          setSelectedHistoryItem(null)
                        }}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </button>
                      {callHistory.length > 0 && (
                        <button
                          onClick={clearAllHistory}
                          className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                        >
                          Clear All
                        </button>
                      )}
                    </div>

                    <h4 className="font-medium text-foreground">Call History</h4>

                    {selectedHistoryItem ? (
                      /* Selected History Item Detail View */
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        <button
                          onClick={() => setSelectedHistoryItem(null)}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <ChevronLeft className="h-3 w-3" />
                          All Calls
                        </button>

                        {/* Caller Info */}
                        <div className="rounded-xl border border-border bg-secondary/30 p-3">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-full",
                              selectedHistoryItem.analysis.verdict === "fake" ? "bg-danger/20" :
                              selectedHistoryItem.analysis.verdict === "real" ? "bg-success/20" : "bg-warning/20"
                            )}>
                              <Phone className={cn(
                                "h-5 w-5",
                                selectedHistoryItem.analysis.verdict === "fake" ? "text-danger" :
                                selectedHistoryItem.analysis.verdict === "real" ? "text-success" : "text-warning"
                              )} />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-foreground">{selectedHistoryItem.callerInfo}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(selectedHistoryItem.timestamp)} at {formatTimestamp(selectedHistoryItem.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex gap-2">
                          {selectedHistoryItem.isReported && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs text-warning">
                              <Flag className="h-3 w-3" />
                              Reported
                            </span>
                          )}
                          {selectedHistoryItem.isBlocked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive">
                              <Ban className="h-3 w-3" />
                              Blocked
                            </span>
                          )}
                        </div>

                        {/* Analysis Result */}
                        <AnalysisResult
                          data={selectedHistoryItem.analysis}
                          onReset={() => setSelectedHistoryItem(null)}
                          isMonitoring={false}
                        />

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReport(selectedHistoryItem.id)}
                            disabled={selectedHistoryItem.isReported}
                            className={cn(
                              "flex-1 gap-1.5",
                              !selectedHistoryItem.isReported && "text-warning border-warning/30 hover:bg-warning/10"
                            )}
                          >
                            <Flag className="h-3.5 w-3.5" />
                            {selectedHistoryItem.isReported ? "Reported" : "Report"}
                          </Button>
                          <Button
                            variant={selectedHistoryItem.isBlocked ? "secondary" : "destructive"}
                            size="sm"
                            onClick={() => handleBlock(selectedHistoryItem.id)}
                            disabled={selectedHistoryItem.isBlocked}
                            className="flex-1 gap-1.5"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            {selectedHistoryItem.isBlocked ? "Blocked" : "Block"}
                          </Button>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteHistoryItem(selectedHistoryItem.id)}
                          className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Delete from History
                        </Button>
                      </motion.div>
                    ) : callHistory.length > 0 ? (
                      /* History List */
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {callHistory.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => setSelectedHistoryItem(item)}
                            className="w-full rounded-xl border border-border bg-secondary/20 p-3 text-left hover:bg-secondary/40 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full",
                                item.analysis.verdict === "fake" ? "bg-danger/20" :
                                item.analysis.verdict === "real" ? "bg-success/20" : "bg-warning/20"
                              )}>
                                {item.analysis.verdict === "fake" ? (
                                  <ShieldAlert className="h-4 w-4 text-danger" />
                                ) : item.analysis.verdict === "real" ? (
                                  <ShieldCheck className="h-4 w-4 text-success" />
                                ) : (
                                  <ShieldQuestion className="h-4 w-4 text-warning" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-foreground text-sm truncate">
                                    {item.callerInfo}
                                  </p>
                                  {item.isBlocked && (
                                    <Ban className="h-3 w-3 text-destructive flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatDate(item.timestamp)}</span>
                                  <span className="text-border">|</span>
                                  <span className={cn(
                                    "capitalize",
                                    item.analysis.verdict === "fake" ? "text-danger" :
                                    item.analysis.verdict === "real" ? "text-success" : "text-warning"
                                  )}>
                                    {item.analysis.verdict === "fake" ? "Likely Fake" :
                                     item.analysis.verdict === "real" ? "Likely Real" : "Uncertain"}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(item.analysis.confidence)}%
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Empty History */
                      <div className="py-8 text-center">
                        <History className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">No call history yet</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Analyzed calls will appear here
                        </p>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="main"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
              {/* Active/Inactive Toggle */}
              <div className="mb-4">
                <button
                  onClick={toggleMonitoring}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl p-4 transition-all",
                    isActive
                      ? "bg-success/10 border border-success/30"
                      : "bg-secondary/50 border border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                        isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Power className="h-5 w-5" />
                    </div>
                    <div className="text-left">
                      <p className={cn(
                        "font-medium",
                        isActive ? "text-success" : "text-muted-foreground"
                      )}>
                        {isActive ? "Active" : "Inactive"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isActive ? "Monitoring audio..." : "Tap to start monitoring"}
                      </p>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "h-6 w-11 rounded-full p-0.5 transition-colors",
                      isActive ? "bg-success" : "bg-muted"
                    )}
                  >
                    <motion.div
                      className="h-5 w-5 rounded-full bg-foreground"
                      animate={{ x: isActive ? 20 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </div>
                </button>
              </div>

              {/* Waveform Visualization */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Audio Input</span>
                  {isActive && (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatTime(monitoringTime)}
                      </span>
                    </div>
                  )}
                </div>
                <AudioWaveform levels={audioLevels} isActive={isActive} />
                {isActive && (
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>{snippetsCount} snippets analyzed</span>
                    <span>2s intervals</span>
                  </div>
                )}
              </div>

              {/* Live Analysis Result - only show during active monitoring */}
              <AnimatePresence mode="wait">
                {isActive && state === "result" && analysisData && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <AnalysisResult
                      data={analysisData}
                      onReset={resetAnalysis}
                      isMonitoring={true}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Last Call Summary - shown when inactive and has history */}
              {!isActive && getLastCall() && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  {/* Last Call Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Last Call Summary</span>
                    </div>
                    <button
                      onClick={() => setShowHistory(true)}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      View All ({callHistory.length})
                    </button>
                  </div>

                  {/* Caller Info Card */}
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full",
                        getLastCall()!.analysis.verdict === "fake" ? "bg-danger/20" :
                        getLastCall()!.analysis.verdict === "real" ? "bg-success/20" : "bg-warning/20"
                      )}>
                        <Phone className={cn(
                          "h-5 w-5",
                          getLastCall()!.analysis.verdict === "fake" ? "text-danger" :
                          getLastCall()!.analysis.verdict === "real" ? "text-success" : "text-warning"
                        )} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{getLastCall()!.callerInfo}</p>
                          {getLastCall()!.isBlocked && (
                            <span className="inline-flex items-center rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] text-destructive">
                              <Ban className="h-2.5 w-2.5 mr-0.5" />
                              Blocked
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(getLastCall()!.timestamp)} at {formatTimestamp(getLastCall()!.timestamp)} - {getLastCall()!.analysis.duration}s
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Analysis Summary */}
                  <AnalysisResult
                    data={getLastCall()!.analysis}
                    onReset={resetAnalysis}
                    isMonitoring={false}
                  />

                  {/* Report & Block Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReport(getLastCall()!.id)}
                      disabled={getLastCall()!.isReported}
                      className={cn(
                        "flex-1 gap-1.5",
                        !getLastCall()!.isReported && "text-warning border-warning/30 hover:bg-warning/10"
                      )}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      {getLastCall()!.isReported ? "Reported" : "Report"}
                    </Button>
                    <Button
                      variant={getLastCall()!.isBlocked ? "secondary" : "destructive"}
                      size="sm"
                      onClick={() => handleBlock(getLastCall()!.id)}
                      disabled={getLastCall()!.isBlocked}
                      className="flex-1 gap-1.5"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      {getLastCall()!.isBlocked ? "Blocked" : "Block Number"}
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Idle state message when no monitoring and no history */}
              {!isActive && callHistory.length === 0 && state === "idle" && (
                <div className="py-6 text-center">
                  <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Toggle monitoring to start analyzing audio for deepfake detection.
                  </p>
                </div>
              )}

              {/* Privacy Disclaimer */}
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
                        Your calls are not recorded or stored. Audio is processed in real-time
                        and immediately discarded after analysis.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

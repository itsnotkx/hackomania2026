"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnalysisResult } from "./analysis-result";
import { AudioWaveform } from "./audio-waveform";
import { VideoPlayer } from "./video-player";

type DetectorState = "idle" | "monitoring" | "analyzing" | "result";
type Verdict = "real" | "fake" | "uncertain";

interface AnalysisPointer {
  type: "warning" | "safe" | "neutral";
  label: string;
  description: string;
}

interface AnalysisData {
  verdict: Verdict;
  confidence: number;
  snippetsAnalyzed: number;
  duration: number;
  pointers: AnalysisPointer[];
}

interface CallHistoryItem {
  id: string;
  analysis: AnalysisData;
  callerInfo: string;
  timestamp: Date;
  isBlocked: boolean;
  isReported: boolean;
}

export function DetectorOverlay() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [state, setState] = useState<DetectorState>("idle");
  const [isActive, setIsActive] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [monitoringTime, setMonitoringTime] = useState(0);
  const [snippetsCount, setSnippetsCount] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(
    Array(24).fill(0.05),
  );
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] =
    useState<CallHistoryItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sourceType, setSourceType] = useState<
    "call" | "video" | "file" | null
  >(null);
  const [showSourceSelector, setShowSourceSelector] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const snippetIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const monitoringStartTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const BACKEND_URL = "http://localhost:8000";

  const updateAudioLevels = useCallback(() => {
    if (analyserRef.current && isActive) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);

      const levels: number[] = [];
      const step = Math.floor(dataArray.length / 24);
      for (let i = 0; i < 24; i++) {
        const value = dataArray[i * step] / 255;
        levels.push(Math.max(0.05, value));
      }
      setAudioLevels(levels);
      animationFrameRef.current = requestAnimationFrame(updateAudioLevels);
    }
  }, [isActive]);

  const createSession = async (): Promise<string | null> => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          source_type: sourceType,
          client_platform: "web",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create session: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(
        "Session with id [" + data.session_id + "] created successfully.",
      );
      return data.session_id;
    } catch (error) {
      console.error("Error creating session:", error);
      return null;
    }
  };

  const sendAudioToBackend = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("session_id", sessionIdRef.current || "");

      const response = await fetch(`${BACKEND_URL}/api/v1/analyze`, {
        method: "POST",
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.text();
        console.error("Analyze error response:", response.status, errBody);
        throw new Error(`Analysis failed: ${response.status} ${errBody}`);
      }

      const data = await response.json();
      console.log("Backend analysis result:", data);
      // Normalize backend labels (likely_real/likely_fake) to frontend verdicts (real/fake)
      if (data.overall?.verdict) {
        const v = data.overall.verdict;
        data.overall.verdict = v === "likely_real" ? "real" : v === "likely_fake" ? "fake" : v;
      }
      return data;
    } catch (error) {
      console.error("Error sending audio to backend:", error);
      return null;
    }
  };

  const startMonitoringWithSource = async () => {
    // Always show source selector to force user selection
    setSourceType(null);
    setShowSourceSelector(true);
  };

  const confirmAndStartMonitoring = async () => {
    try {
      setShowSourceSelector(false);

      // Capture screen + audio using getDisplayMedia
      let audioStream: MediaStream;
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        // Extract audio tracks from display stream
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          // Create a new audio-only stream from the display stream audio
          audioStream = new MediaStream(audioTracks);
          console.log("Screen audio captured successfully");
        } else {
          // Fallback to microphone if no audio from screen
          console.warn(
            "No audio from screen capture, falling back to microphone",
          );
          audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
        }

        // Stop video tracks since we only need audio
        displayStream.getVideoTracks().forEach((track) => track.stop());
      } catch (error) {
        console.warn(
          "Screen recording not available, falling back to microphone:",
          error,
        );
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      }

      streamRef.current = audioStream;

      // Create backend session with the selected source type
      const sessionId = await createSession();
      if (!sessionId) {
        console.warn(
          "Failed to create backend session, continuing with local analysis",
        );
      } else {
        sessionIdRef.current = sessionId;
      }

      // Helper: create a fresh MediaRecorder that produces a complete webm file
      const startNewRecorder = () => {
        if (!streamRef.current?.active) return;
        const recorder = new MediaRecorder(streamRef.current, {
          mimeType: "audio/webm",
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          if (blob.size > 0 && sessionIdRef.current) {
            const result = await sendAudioToBackend(blob);
            setSnippetsCount((prev) => {
              const newCount = prev + 1;
              if (result) {
                setAnalysisData({
                  verdict: result.overall.verdict,
                  confidence: result.overall.peak_score * 100,
                  snippetsAnalyzed: newCount,
                  duration: newCount * 2,
                  pointers: generatePointers(result.overall.verdict),
                });
                setState("result");
                setIsProcessing(false);
              }
              return newCount;
            });
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      };

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source =
        audioContextRef.current.createMediaStreamSource(audioStream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = 256;

      setIsActive(true);
      setState("monitoring");
      setMonitoringTime(0);
      setSnippetsCount(0);
      setAnalysisData(null);
      setIsProcessing(true);
      monitoringStartTimeRef.current = Date.now();

      // Show initial 6-second loading state
      processingTimeoutRef.current = setTimeout(() => {
        setIsProcessing(false);
      }, 6000);

      timerRef.current = setInterval(() => {
        setMonitoringTime((prev) => prev + 1);
      }, 1000);

      // Start first recording, then cycle every 2 seconds
      startNewRecorder();
      snippetIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop(); // triggers onstop → sends data
        }
        startNewRecorder(); // new recorder with fresh webm header
      }, 2000);

      updateAudioLevels();
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setIsActive(false);
    }
  };

  const simulateAnalysisUpdate = (snippetCount: number) => {
    // Simulate backend returning analysis results
    // Replace this with actual API response handling

    // Calculate time elapsed since monitoring started
    const timeElapsed = monitoringStartTimeRef.current
      ? (Date.now() - monitoringStartTimeRef.current) / 1000
      : 0;

    // Only show processing state during first 6 seconds
    const processingDelay = timeElapsed < 6 ? 6000 - timeElapsed * 1000 : 0;

    if (processingDelay > 0) {
      setIsProcessing(true);
    }

    processingTimeoutRef.current = setTimeout(() => {
      const verdicts: Verdict[] = ["real", "fake", "uncertain"];
      const randomVerdict = verdicts[Math.floor(Math.random() * 3)];

      setAnalysisData({
        verdict: randomVerdict,
        confidence: 60 + Math.random() * 35,
        snippetsAnalyzed: snippetCount,
        duration: snippetCount * 2,
        pointers: generatePointers(randomVerdict),
      });
      setState("result");
      setIsProcessing(false);
    }, processingDelay);
  };

  const generatePointers = (verdict: Verdict): AnalysisPointer[] => {
    if (verdict === "fake") {
      return [
        {
          type: "warning",
          label: "Pitch Anomalies",
          description:
            "Unnatural pitch transitions detected in speech patterns",
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
      ];
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
      ];
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
        description:
          "Some indicators suggest both natural and synthetic elements",
      },
    ];
  };

  const stopMonitoring = () => {
    setIsActive(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    if (snippetIntervalRef.current) {
      clearInterval(snippetIntervalRef.current);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }

    setAudioLevels(Array(24).fill(0.05));
    monitoringStartTimeRef.current = null;
    sessionIdRef.current = null;

    // Save to call history when stopping with analysis results
    if (analysisData && snippetsCount > 0) {
      const newHistoryItem: CallHistoryItem = {
        id: Date.now().toString(),
        analysis: analysisData,
        callerInfo:
          "+1 (555) " +
          Math.floor(100 + Math.random() * 900) +
          "-" +
          Math.floor(1000 + Math.random() * 9000), // Simulated caller ID
        timestamp: new Date(),
        isBlocked: false,
        isReported: false,
      };
      setCallHistory((prev) => [newHistoryItem, ...prev]);
    }

    setState("idle");
    setAnalysisData(null);
  };

  const cancelSourceSelector = () => {
    // Don't allow canceling - require source selection
    // User must select a source type to proceed
  };

  const handleSourceTypeChange = (type: "call" | "video" | "file") => {
    setSourceType(type);
  };

  const toggleMonitoring = () => {
    if (isActive) {
      stopMonitoring();
    } else {
      startMonitoringWithSource();
    }
  };

  const resetAnalysis = () => {
    if (isActive) {
      stopMonitoring();
    }
    setState("idle");
    setAnalysisData(null);
    setMonitoringTime(0);
    setSnippetsCount(0);
  };

  const handleReport = (itemId: string) => {
    setCallHistory((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isReported: true } : item,
      ),
    );
  };

  const handleBlock = (itemId: string) => {
    setCallHistory((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, isBlocked: true } : item,
      ),
    );
  };

  const handleDeleteHistoryItem = (itemId: string) => {
    setCallHistory((prev) => prev.filter((item) => item.id !== itemId));
    if (selectedHistoryItem?.id === itemId) {
      setSelectedHistoryItem(null);
    }
  };

  const clearAllHistory = () => {
    setCallHistory([]);
    setSelectedHistoryItem(null);
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getLastCall = () => callHistory[0] || null;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (snippetIntervalRef.current) clearInterval(snippetIntervalRef.current);
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
      if (processingTimeoutRef.current)
        clearTimeout(processingTimeoutRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      if (streamRef.current)
        streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStateIcon = () => {
    if (state === "result" && analysisData) {
      if (analysisData.verdict === "real")
        return <ShieldCheck className="h-5 w-5" />;
      if (analysisData.verdict === "fake")
        return <ShieldAlert className="h-5 w-5" />;
      return <ShieldQuestion className="h-5 w-5" />;
    }
    return <Shield className="h-5 w-5" />;
  };

  const getBubbleColor = () => {
    if (state === "result" && analysisData) {
      switch (analysisData.verdict) {
        case "real":
          return "bg-success/20 border-success/50 text-success";
        case "fake":
          return "bg-danger/20 border-danger/50 text-danger";
        case "uncertain":
          return "bg-warning/20 border-warning/50 text-warning";
      }
    }
    if (isActive) {
      return "bg-success/20 border-success/50 text-success";
    }
    return "bg-muted/50 border-border text-muted-foreground";
  };

  const getStatusText = () => {
    if (state === "result" && analysisData) return "Analysis available";
    if (isActive) return "Monitoring active";
    return "Inactive";
  };

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
              getBubbleColor(),
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
                  <h3 className="text-sm font-semibold text-foreground">
                    DeepGuard
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {getStatusText()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "h-8 w-8 relative",
                    showHistory
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <History className="h-4 w-4" />
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
                          setShowHistory(false);
                          setSelectedHistoryItem(null);
                        }}
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Back
                      </button>
                    </div>

                    <h4 className="font-medium text-foreground">
                      Call History
                    </h4>

                    {selectedHistoryItem ? (
                      /* Selected History Item Detail View */
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-3"
                      >
                        {/* Caller Info */}
                        <div className="rounded-xl border border-border bg-secondary/30 p-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full",
                                selectedHistoryItem.analysis.verdict === "fake"
                                  ? "bg-danger/20"
                                  : selectedHistoryItem.analysis.verdict ===
                                      "real"
                                    ? "bg-success/20"
                                    : "bg-warning/20",
                              )}
                            >
                              <Phone
                                className={cn(
                                  "h-5 w-5",
                                  selectedHistoryItem.analysis.verdict ===
                                    "fake"
                                    ? "text-danger"
                                    : selectedHistoryItem.analysis.verdict ===
                                        "real"
                                      ? "text-success"
                                      : "text-warning",
                                )}
                              />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-foreground">
                                {selectedHistoryItem.callerInfo}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(selectedHistoryItem.timestamp)} at{" "}
                                {formatTimestamp(selectedHistoryItem.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Status Badges */}
                        <div className="flex gap-2">
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
                          hideActions={true}
                        />

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDeleteHistoryItem(selectedHistoryItem.id)
                          }
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
                              <div
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-full",
                                  item.analysis.verdict === "fake"
                                    ? "bg-danger/20"
                                    : item.analysis.verdict === "real"
                                      ? "bg-success/20"
                                      : "bg-warning/20",
                                )}
                              >
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
                                  <span
                                    className={cn(
                                      "capitalize",
                                      item.analysis.verdict === "fake"
                                        ? "text-danger"
                                        : item.analysis.verdict === "real"
                                          ? "text-success"
                                          : "text-warning",
                                    )}
                                  >
                                    {item.analysis.verdict === "fake"
                                      ? "Likely Fake"
                                      : item.analysis.verdict === "real"
                                        ? "Likely Real"
                                        : "Uncertain"}
                                  </span>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {item.analysis.confidence.toFixed(1)}%
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      /* Empty History */
                      <div className="py-8 text-center">
                        <History className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No call history yet
                        </p>
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
                    <div className="mb-2">
                      <button
                        onClick={toggleMonitoring}
                        className={cn(
                          "flex w-full items-center justify-between rounded-xl p-4 transition-all",
                          isActive
                            ? "bg-success/10 border border-success/30"
                            : "bg-secondary/50 border border-border",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                              isActive
                                ? "bg-success text-success-foreground"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Power className="h-5 w-5" />
                          </div>
                          <div className="text-left">
                            <p
                              className={cn(
                                "font-medium",
                                isActive
                                  ? "text-success"
                                  : "text-muted-foreground",
                              )}
                            >
                              {isActive ? "Active" : "Inactive"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {isActive
                                ? "Monitoring audio..."
                                : "Tap to start monitoring"}
                            </p>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "h-6 w-11 rounded-full p-0.5 transition-colors",
                            isActive ? "bg-success" : "bg-muted",
                          )}
                        >
                          <motion.div
                            className="h-5 w-5 rounded-full bg-foreground"
                            animate={{ x: isActive ? 20 : 0 }}
                            transition={{
                              type: "spring",
                              stiffness: 500,
                              damping: 30,
                            }}
                          />
                        </div>
                      </button>
                    </div>

                    {/* Waveform Visualization */}
                    {isActive && (
                      <div className="mb-4 space-y-2">
                        <div className="flex items-center justify-center gap-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                            </span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {formatTime(monitoringTime)}
                            </span>
                          </div>
                            <AudioWaveform isPlaying={isActive} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Audio Input
                        </span>
                      </div>
                    )}

                    {/* Live Analysis Result - only show during active monitoring */}
                    <AnimatePresence mode="wait">
                      {isActive && isProcessing && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="space-y-4 text-center"
                        >
                          <div className="flex flex-col items-center gap-3 py-6">
                            <div className="relative h-12 w-12">
                              <motion.div
                                className="absolute inset-0 rounded-full border-2 border-primary/20"
                                animate={{ rotate: 360 }}
                                transition={{
                                  duration: 2,
                                  repeat: Infinity,
                                  ease: "linear",
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="h-2 w-2 rounded-full bg-primary" />
                              </div>
                            </div>
                            <div>
                              <p className="font-semibold text-foreground">
                                Analyzing Audio
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Listening, your analysis will be ready soon...
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      {isActive &&
                        state === "result" &&
                        analysisData &&
                        !isProcessing && (
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

                    {/* Last Call Summary */}
                    {!isActive && getLastCall() && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            Last Call Summary
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setShowHistory(true);
                            setSelectedHistoryItem(getLastCall()!);
                          }}
                          className="w-full rounded-lg border border-border bg-secondary/20 p-3 space-y-2 hover:bg-secondary/40 transition-colors cursor-pointer text-left"
                        >
                          {/* Phone Number & Time */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-full",
                                  getLastCall()!.analysis.verdict === "fake"
                                    ? "bg-destructive/20"
                                    : "bg-green-500/20",
                                )}
                              >
                                <Phone
                                  className={cn(
                                    "h-4 w-4",
                                    getLastCall()!.analysis.verdict === "fake"
                                      ? "text-destructive"
                                      : "text-green-500",
                                  )}
                                />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">
                                  {getLastCall()!.callerInfo}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(getLastCall()!.timestamp)}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {formatTime(getLastCall()!.analysis.duration)}
                            </p>
                          </div>

                          {/* Verdict & Confidence */}
                          <div className="space-y-1 pt-2 border-t border-border">
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-muted-foreground">
                                Verdict
                              </p>
                              <p
                                className={cn(
                                  "text-sm font-semibold capitalize",
                                  getLastCall()!.analysis.verdict === "fake"
                                    ? "text-destructive"
                                    : getLastCall()!.analysis.verdict === "real"
                                      ? "text-green-500"
                                      : "text-yellow-500",
                                )}
                              >
                                {getLastCall()!.analysis.verdict}
                              </p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-muted-foreground">
                                Confidence
                              </p>
                              <p className="text-sm font-semibold">
                                {getLastCall()!.analysis.confidence.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Idle state message when no monitoring and no history */}
                    {!isActive &&
                      callHistory.length === 0 &&
                      state === "idle" && (
                        <div className="py-6 text-center">
                          <Shield className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
                          <p className="text-sm text-muted-foreground">
                            Toggle monitoring to start analyzing audio for
                            deepfake detection.
                          </p>
                        </div>
                      )}

                    {/* Privacy Disclaimer */}
                    <div className="mt-4 pt-3 border-t border-border">
                      <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
                        Your calls are not recorded or stored. Audio is
                        processed in real-time and immediately discarded after
                        analysis.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Source Type Selector Modal */}
      <AnimatePresence>
        {showSourceSelector && (
          <motion.div
            key="source-selector"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={cancelSourceSelector}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6"
            >
              <h2 className="text-lg font-semibold text-foreground mb-2">
                Select Audio Source
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                This can be changed anytime later on.
              </p>

              <div className="space-y-2 mb-6">
                {(["call", "video", "file"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleSourceTypeChange(type)}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 transition-all text-left",
                      sourceType === type
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 bg-secondary/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                          sourceType === type
                            ? "border-primary bg-primary"
                            : "border-muted-foreground",
                        )}
                      >
                        {sourceType === type && (
                          <div className="w-2 h-2 bg-primary-foreground rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground capitalize">
                          {type === "call"
                            ? "📞 Phone/Video Call"
                            : type === "video"
                              ? "🎬 Video Playing"
                              : "📁 File Upload"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {type === "call"
                            ? "Call audio from other person (screenshare)"
                            : type === "video"
                              ? "Video, music, or media player content"
                              : "Uploaded or local audio file"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <Button
                className="w-full bg-primary hover:bg-primary/90"
                onClick={confirmAndStartMonitoring}
                disabled={!sourceType}
              >
                Start Monitoring
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">
                Select a source to proceed
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

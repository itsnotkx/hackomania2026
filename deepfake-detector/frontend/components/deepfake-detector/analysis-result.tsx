"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  AlertTriangle,
  CheckCircle2,
  Info,
  RotateCcw,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

interface AnalysisResultProps {
  data: AnalysisData;
  onReset: () => void;
  isMonitoring?: boolean;
  hideActions?: boolean;
}

export function AnalysisResult({
  data,
  onReset,
  isMonitoring = false,
  hideActions = false,
}: AnalysisResultProps) {
  const getVerdictConfig = () => {
    switch (data.verdict) {
      case "real":
        return {
          icon: ShieldCheck,
          label: "Likely Real",
          color: "text-success",
          bgColor: "bg-success/10",
          borderColor: "border-success/30",
          progressColor: "bg-success",
        };
      case "fake":
        return {
          icon: ShieldAlert,
          label: "Likely Fake",
          color: "text-danger",
          bgColor: "bg-danger/10",
          borderColor: "border-danger/30",
          progressColor: "bg-danger",
        };
      case "uncertain":
        return {
          icon: ShieldQuestion,
          label: "Uncertain",
          color: "text-warning",
          bgColor: "bg-warning/10",
          borderColor: "border-warning/30",
          progressColor: "bg-warning",
        };
    }
  };

  const config = getVerdictConfig();
  const VerdictIcon = config.icon;

  const getPointerIcon = (type: "warning" | "safe" | "neutral") => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-3.5 w-3.5 text-danger" />;
      case "safe":
        return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case "neutral":
        return <Info className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {/* Verdict Card */}
      <div
        className={cn(
          "rounded-xl border p-4 text-center",
          config.bgColor,
          config.borderColor,
        )}
      >
        <VerdictIcon className={cn("mx-auto h-10 w-10", config.color)} />
        <h4 className={cn("mt-2 text-lg font-semibold", config.color)}>
          {config.label}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Based on {data.snippetsAnalyzed} audio snippets ({data.duration}s
          total)
        </p>
      </div>

      {/* Confidence Score */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Confidence Score</span>
          <span className={cn("font-semibold", config.color)}>
            {data.confidence.toFixed(1)}%
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${data.confidence}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={cn("h-full rounded-full", config.progressColor)}
          />
        </div>
      </div>

      {/* Analysis Pointers */}
      <div className="space-y-2">
        <h5 className="text-sm font-medium text-foreground">
          Analysis Pointers
        </h5>
        <div className="space-y-2">
          {data.pointers.map((pointer, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-2 rounded-lg bg-secondary/50 p-2.5"
            >
              <div className="mt-0.5">{getPointerIcon(pointer.type)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {pointer.label}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {pointer.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Actions - only show when not actively monitoring */}
      {!isMonitoring && (
        <div className="flex gap-2">
          {!hideActions && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              className="flex-1 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Analysis
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className={hideActions ? "w-full gap-1.5" : "flex-1 gap-1.5"}
          >
            <Share2 className="h-3.5 w-3.5" />
            Share Report
          </Button>
        </div>
      )}
    </motion.div>
  );
}

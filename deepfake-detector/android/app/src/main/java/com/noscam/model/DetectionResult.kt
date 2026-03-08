package com.noscam.model

import com.google.gson.annotations.SerializedName

enum class OverlayState { DETECTING, REAL, UNCERTAIN, FAKE, SCAM_ALERT, PAUSED }

data class DetectionResult(
    val type: String,
    val seq: Int,
    val score: Float,
    val label: String,
    val confidence: Float,
    @SerializedName("rolling_avg") val rollingAvg: Float,
    @SerializedName("latency_ms") val latencyMs: Int
) {
    companion object {
        fun labelToState(label: String): OverlayState = when (label) {
            "likely_real" -> OverlayState.REAL
            "uncertain"   -> OverlayState.UNCERTAIN
            "likely_fake" -> OverlayState.FAKE
            else          -> OverlayState.DETECTING
        }
    }
}

data class SecondaryResult(
    val type: String,
    val transcript: String,
    @SerializedName("urgency_level") val urgencyLevel: String,
    @SerializedName("confidence_score") val confidenceScore: Float,
    val reasoning: String,
    @SerializedName("latency_ms") val latencyMs: Int
) {
    val isSuspicious: Boolean get() = urgencyLevel == "high" || urgencyLevel == "critical"
}

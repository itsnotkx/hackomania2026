package com.noscam.model

import com.google.gson.annotations.SerializedName

data class SessionResponse(
    @SerializedName("session_id") val sessionId: String,
    @SerializedName("created_at") val createdAt: String,
    val config: SessionConfig
)

data class SessionConfig(
    @SerializedName("recommended_chunk_ms") val recommendedChunkMs: Int,
    @SerializedName("sample_rate") val sampleRate: Int,
    val encoding: String,
    val channels: Int
)

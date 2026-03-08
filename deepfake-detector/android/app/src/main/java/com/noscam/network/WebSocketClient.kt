package com.noscam.network

import com.google.gson.Gson
import com.google.gson.JsonObject
import com.noscam.model.DetectionResult
import com.noscam.model.SecondaryResult
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit

class WebSocketClient(
    baseUrl: String,
    sessionId: String,
    private val onResult: (DetectionResult) -> Unit,
    private val onSecondaryResult: (SecondaryResult) -> Unit,
    private val onError: (String) -> Unit
) {
    private val wsUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .let { "$it/ws/v1/stream/$sessionId" }

    private val gson = Gson()
    private var seq = 0
    private var startTimeMs = 0L
    private var ws: WebSocket? = null

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .build()

    fun connect() {
        startTimeMs = System.currentTimeMillis()
        val request = Request.Builder().url(wsUrl).build()
        ws = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val json = gson.fromJson(text, JsonObject::class.java)
                    when (json.get("type")?.asString) {
                        "result" -> {
                            val result = gson.fromJson(text, DetectionResult::class.java)
                            onResult(result)
                        }
                        "secondary_result" -> {
                            val result = gson.fromJson(text, SecondaryResult::class.java)
                            onSecondaryResult(result)
                        }
                    }
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t.message ?: "WebSocket error")
            }
        })
    }

    fun sendAudioChunk(pcmBytes: ByteArray) {
        val currentSeq = ++seq
        val timestampMs = System.currentTimeMillis() - startTimeMs

        // Send metadata as text frame first
        val meta = """{"type":"audio_chunk","seq":$currentSeq,"timestamp_ms":$timestampMs,"is_remote_speaker":true}"""
        ws?.send(meta)

        // Send raw PCM as binary frame
        ws?.send(pcmBytes.toByteString())
    }

    fun pause() = ws?.send("""{"type":"pause"}""")
    fun resume() = ws?.send("""{"type":"resume"}""")

    fun close() {
        ws?.send("""{"type":"close"}""")
        ws?.close(1000, "User stopped detection")
    }
}

package com.noscam.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AudioCapture(private val onChunk: (ByteArray) -> Unit) {

    companion object {
        const val SAMPLE_RATE = 16000
        const val CHUNK_SAMPLES = SAMPLE_RATE * 2          // 2 seconds
        const val CHUNK_BYTES = CHUNK_SAMPLES * 2          // 16-bit = 2 bytes/sample
    }

    private var recorder: AudioRecord? = null
    private var captureJob: Job? = null

    fun start() {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        recorder = AudioRecord(
            MediaRecorder.AudioSource.VOICE_COMMUNICATION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, CHUNK_BYTES)
        )
        recorder!!.startRecording()

        captureJob = CoroutineScope(Dispatchers.IO).launch {
            val buffer = ByteArray(CHUNK_BYTES)
            var offset = 0
            while (isActive) {
                val read = recorder!!.read(buffer, offset, CHUNK_BYTES - offset)
                if (read > 0) {
                    offset += read
                    if (offset >= CHUNK_BYTES) {
                        onChunk(buffer.copyOf(CHUNK_BYTES))
                        offset = 0
                    }
                }
            }
        }
    }

    fun stop() {
        captureJob?.cancel()
        recorder?.stop()
        recorder?.release()
        recorder = null
    }
}

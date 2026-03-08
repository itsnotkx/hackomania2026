package com.noscam.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Test

class DetectionResultTest {
    private val gson = Gson()

    @Test
    fun `parses result json correctly`() {
        val json = """
            {
              "type": "result",
              "seq": 3,
              "score": 0.87,
              "label": "likely_fake",
              "confidence": 0.91,
              "rolling_avg": 0.64,
              "latency_ms": 120
            }
        """.trimIndent()

        val result = gson.fromJson(json, DetectionResult::class.java)

        assertEquals("result", result.type)
        assertEquals(3, result.seq)
        assertEquals(0.87f, result.score, 0.001f)
        assertEquals("likely_fake", result.label)
        assertEquals(0.64f, result.rollingAvg, 0.001f)
    }

    @Test
    fun `label maps to overlay state correctly`() {
        assertEquals(OverlayState.REAL, DetectionResult.labelToState("likely_real"))
        assertEquals(OverlayState.UNCERTAIN, DetectionResult.labelToState("uncertain"))
        assertEquals(OverlayState.FAKE, DetectionResult.labelToState("likely_fake"))
        assertEquals(OverlayState.DETECTING, DetectionResult.labelToState("unknown"))
    }
}

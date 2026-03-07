package com.noscam.network

import org.junit.Assert.assertTrue
import org.junit.Test

class ApiClientTest {

    @Test
    fun `builds correct session request body`() {
        val body = ApiClient.buildSessionRequestBody()
        assertTrue(body.contains("\"source_type\":\"call\""))
        assertTrue(body.contains("\"client_platform\":\"android\""))
        assertTrue(body.contains("\"sample_rate\":16000"))
        assertTrue(body.contains("\"chunk_duration_ms\":2000"))
    }
}

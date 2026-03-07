package com.noscam.network

import com.google.gson.Gson
import com.noscam.model.SessionResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

class ApiClient(private val baseUrl: String) {

    private val client = OkHttpClient()
    private val gson = Gson()
    private val json = "application/json; charset=utf-8".toMediaType()

    suspend fun createSession(): SessionResponse = withContext(Dispatchers.IO) {
        val body = buildSessionRequestBody().toRequestBody(json)
        val request = Request.Builder()
            .url("$baseUrl/api/v1/sessions")
            .post(body)
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) error("Session create failed: ${response.code}")
            gson.fromJson(response.body!!.charStream(), SessionResponse::class.java)
        }
    }

    suspend fun deleteSession(sessionId: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/v1/sessions/$sessionId")
            .delete()
            .build()
        client.newCall(request).execute().use { /* fire and forget */ }
    }

    companion object {
        fun buildSessionRequestBody(): String =
            """{"source_type":"call","client_platform":"android","metadata":{"sample_rate":16000,"chunk_duration_ms":2000}}"""
    }
}

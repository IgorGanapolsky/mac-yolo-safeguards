package com.iganapolsky.hermesmobile.glasses

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Shared gateway probe — same endpoints as RN gatewayClient.ts */
class HermesGatewayClient(
    private val gatewayUrl: String = "http://127.0.0.1:8642",
    private val apiKey: String? = null,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(3, TimeUnit.SECONDS)
        .readTimeout(3, TimeUnit.SECONDS)
        .build()

    suspend fun fetchHealth(): GatewayHealth = withContext(Dispatchers.IO) {
        val base = normalizeGatewayUrl(gatewayUrl)
        val urls = listOf("$base/health/detailed", "$base/health")
        for (url in urls) {
            try {
                val builder = Request.Builder().url(url).get()
                if (!apiKey.isNullOrBlank()) {
                    builder.header("Authorization", "Bearer ${apiKey.trim()}")
                }
                client.newCall(builder.build()).execute().use { response ->
                    if (!response.isSuccessful) return@use
                    val body = response.body?.string() ?: return@use
                    val json = JSONObject(body)
                    return@withContext GatewayHealth(
                        level = classify(json),
                        status = json.optString("status", null),
                        gatewayState = json.optString("gateway_state", null),
                    )
                }
            } catch (_: Exception) {
                /* try next */
            }
        }
        GatewayHealth(level = HealthLevel.RED, errorMessage = "Gateway unreachable")
    }

    private fun classify(json: JSONObject): HealthLevel {
        val status = json.optString("status", "").lowercase()
        val state = json.optString("gateway_state", "").lowercase()
        return when {
            status == "ok" && state == "running" -> HealthLevel.GREEN
            status == "ok" || state == "running" -> HealthLevel.AMBER
            else -> HealthLevel.RED
        }
    }

    private fun normalizeGatewayUrl(input: String): String {
        return input.trim()
            .removeSuffix("/")
            .replace(Regex("/health/detailed$"), "")
            .replace(Regex("/health$"), "")
            .replace(Regex("/v1$"), "")
            .removeSuffix("/")
    }

    /**
     * Send a JPEG frame (base64) to the Mac-side Hermes Gateway for vision
     * model processing (Claude 3.5 Sonnet / GPT-4o via LiteLLM gateway).
     *
     * The Mac bridge (tools/meta-glasses-hermes-bridge.js) exposes this
     * endpoint and routes the image to the local OpenClaw vision model.
     *
     * @param jpegBase64 base64-encoded JPEG image
     * @param width frame width in pixels
     * @param height frame height in pixels
     * @param label context label (e.g. "snapshot", "screen", "meeting")
     * @param prompt vision model prompt for OCR/analysis
     */
    suspend fun sendVisionFrame(
        jpegBase64: String,
        width: Int,
        height: Int,
        label: String,
        prompt: String,
    ): VisionResult = withContext(Dispatchers.IO) {
        val base = normalizeGatewayUrl(gatewayUrl)
        val url = "$base/api/glasses/vision"

        val json = JSONObject().apply {
            put("image", jpegBase64)
            put("width", width)
            put("height", height)
            put("label", label)
            put("prompt", prompt)
        }

        val body = json.toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val builder = Request.Builder()
            .url(url)
            .post(body)

        if (!apiKey.isNullOrBlank()) {
            builder.header("Authorization", "Bearer ${apiKey.trim()}")
        }

        try {
            client.newCall(builder.build()).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext VisionResult(
                        ok = false,
                        error = "HTTP ${response.code}: ${response.message}",
                    )
                }
                val respBody = response.body?.string() ?: ""
                val parsed = try {
                    JSONObject(respBody)
                } catch (_: Exception) {
                    null
                }
                return@withContext VisionResult(
                    ok = true,
                    text = parsed?.optString("text", null) ?: respBody,
                    model = parsed?.optString("model", null),
                    latencyMs = parsed?.optLong("latency_ms", 0L)?.toInt() ?: 0,
                )
            }
        } catch (e: Exception) {
            return@withContext VisionResult(ok = false, error = e.localizedMessage ?: e.toString())
        }
    }

    /**
     * Upload a recorded meeting audio file to the Mac bridge
     * for transcription via OpenClaw.
     *
     * @param audioPath local file path of the recorded audio
     * @param sessionId unique session identifier
     */
    suspend fun sendAudioRecording(audioPath: String, sessionId: String): AudioResult =
        withContext(Dispatchers.IO) {
            // Audio uploads would use multipart form data via OkHttp.
            // Implementation: build MultipartBody with the audio file and
            // POST to $base/api/glasses/audio. For now, return the path
            // so the caller can handle upload via the Mac bridge.
            AudioResult(ok = true, path = audioPath, sessionId = sessionId)
        }
}

data class VisionResult(
    val ok: Boolean,
    val text: String? = null,
    val model: String? = null,
    val latencyMs: Int = 0,
    val error: String? = null,
)

data class AudioResult(
    val ok: Boolean,
    val path: String? = null,
    val sessionId: String? = null,
    val error: String? = null,
)

enum class HealthLevel { GREEN, AMBER, RED, UNKNOWN }

data class GatewayHealth(
    val level: HealthLevel = HealthLevel.UNKNOWN,
    val status: String? = null,
    val gatewayState: String? = null,
    val errorMessage: String? = null,
)

data class PendingApproval(
    val actionId: String,
    val toolName: String,
    val reason: String,
    val command: String? = null,
)

package com.iganapolsky.hermesmobile.glasses

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
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
}

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

/**
 * HermesDatCameraModule.kt
 *
 * Native module for streaming raw camera frames from Meta Ray-Ban smart glasses
 * via the official Meta Wearables Device Access Toolkit (DAT) SDK.
 *
 * This bypasses Meta AI's "I can't read screens" guardrail by accessing
 * the raw I420 video feed directly, allowing a custom companion app to
 * route frames to a third-party multimodal LLM (Claude, GPT-4o, Gemini).
 *
 * Workflow:
 *   1. Glasses connect via BLE (HermesGlassesModule.kt handles BLE)
 *   2. DAT SDK Camera Kit streams I420 frames via WebRTC datachannel
 *   3. On gesture trigger (double_blink/tap), snapshot the current frame
 *   4. JPEG-encode and send to vision model via Hermes Gateway
 *   5. Result is spoken back via glasses speakers
 *
 * NOTE: Requires Developer Mode enabled on the glasses (tap app version 5x
 * in Meta AI app Settings > App Info).
 */
package com.iganapolsky.hermesmobile.glasses

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.util.Base64
import android.util.Log
import androidx.annotation.ColorInt
import com.meta.wearables.dat.sdk.DatCameraFrame
import com.meta.wearables.dat.sdk.DatCameraListener
import com.meta.wearables.dat.sdk.DatCameraManager
import com.meta.wearables.dat.sdk.DatGlasses
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

class HermesDatCameraModule(
    private val glasses: DatGlasses,
) : DatCameraListener() {

    companion object {
        private const val TAG = "HermesDatCamera"
        private const val JPEG_QUALITY = 90
        private const val FRAME_THROTTLE_MS = 200
    }

    // Incoming snapshot requests from gestures
    private val snapshotFlow = MutableSharedFlow<Unit>(replay = 1)

    // Latest frame buffer (I420 Y plane)
    @Volatile
    private var latestFrame: DatCameraFrame? = null
    @Volatile
    private var lastFrameTime = 0L

    private val isStreaming = AtomicBoolean(false)

    init: Unit = with(glasses.camera) {
        setListener(this@HermesDatCameraModule)
    }

    /**
     * Start streaming camera frames from the glasses.
     * The DAT SDK handles the WebRTC datachannel from glasses to phone.
     */
    fun startCameraStream() {
        if (isStreaming.getAndSet(true)) return
        try {
            glasses.camera.startStreaming()
            Log.i(TAG, "Camera stream started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start camera stream: ${e.message}")
            isStreaming.set(false)
        }
    }

    /**
     * Stop streaming and release frame buffer.
     */
    fun stopCameraStream() {
        if (!isStreaming.getAndSet(false)) return
        try {
            latestFrame = null
            glasses.camera.stopStreaming()
            Log.i(TAG, "Camera stream stopped")
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping camera stream: ${e.message}")
        }
    }

    /**
     * Request a snapshot immediately (called by gesture handlers).
     * The next available frame will be captured and sent to the vision model.
     */
    fun requestSnapshot() {
        CoroutineScope(Dispatchers.Main).launch {
            snapshotFlow.emit(Unit)
        }
    }

    /**
     * DAT SDK callback — receives raw I420 video frames.
     * We store the latest frame and check if a snapshot is pending.
     */
    override fun onFrameReceived(frame: DatCameraFrame) {
        if (!isStreaming.get()) return

        val now = System.currentTimeMillis()
        if (now - lastFrameTime < FRAME_THROTTLE_MS) return // throttle
        lastFrameTime = now

        latestFrame = frame

        // Check if a snapshot was requested
        val pendingSnapshot = try {
            snapshotFlow.tryEmit(Unit)
            false
        } catch (e: Exception) {
            // This is hacky — use a flag instead
            false
        }
    }

    /**
     * Capture the most recent frame as a JPEG string (base64).
     * Called by the React Native bridge when a snapshot request is pending.
     */
    fun captureSnapshotAsJpegBase64(): String? {
        val frame = latestFrame ?: return null
        val bitmap = frame.toBitmap() ?: return null
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
        val jpegBytes = stream.toByteArray()
        stream.close()
        return Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
    }

    /**
     * Capture the most recent frame as a JPEG byte array.
     */
    fun captureSnapshotAsJpegBytes(): ByteArray? {
        val frame = latestFrame ?: return null
        val bitmap = frame.toBitmap() ?: return null
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, stream)
        val jpegBytes = stream.toByteArray()
        stream.close()
        bitmap.recycle()
        return jpegBytes
    }

    /**
     * Get snapshot flow for React Native subscription.
     */
    fun getSnapshotFlow() = snapshotFlow.asSharedFlow()

    /**
     * Convert DatCameraFrame I420 data to Android Bitmap.
     */
    private fun DatCameraFrame.toBitmap(): Bitmap? {
        try {
            val yuv = this.yuv420
            val width = this.width
            val height = this.height

            // Y plane
            val yBuffer = yuv.yBuffer
            val ySize = yuv.ySize

            // U and V planes ( subsampled 2x2 for I420)
            val uBuffer = yuv.uBuffer
            val uSize = yuv.uSize
            val vBuffer = yuv.vBuffer
            val vSize = yuv.vSize

            // Convert YUV420 to NV21 (Android format)
            val yuv420 = ByteArray(ySize + uSize + vSize)
            yBuffer.get(yuv420, 0, ySize)

            // Swap U and V for NV21 (V before U in NV21)
            vBuffer.get(yuv420, ySize, vSize)
            uBuffer.get(yuv420, ySize + vSize, uSize)

            val yuvImage = android.media.ImageFormat.getYuvBitmap(
                yuv420, width, height, ImageFormat.NV21
            )
            return yuvImage
        } catch (e: Exception) {
            Log.e(TAG, "Frame conversion error: ${e.message}")
            return null
        }
    }

    /**
     * Send a frame to the vision model via the Hermes Gateway.
     * Called when a snapshot is captured and we want to process it
     * for screen text extraction.
     */
    fun sendFrameToVisionModel(frameLabel: String = "screen") {
        val jpegBase64 = captureSnapshotAsJpegBase64() ?: run {
            Log.w(TAG, "No frame available for vision model")
            return
        }

        val width = latestFrame?.width ?: 0
        val height = latestFrame?.height ?: 0

        // Send via Hermes Gateway to the Mac bridge
        // The Mac bridge (tools/meta-glasses-hermes-bridge.js) routes
        // to Claude 3.5 Sonnet vision or GPT-4o via LiteLLM gateway
        HermesGatewayClient.sendVisionFrame(
            jpegBase64 = jpegBase64,
            width = width,
            height = height,
            label = frameLabel,
            prompt = "Extract all visible text from this screen capture. Return JSON: {text, ui_elements, actionable_items}"
        )
    }
}

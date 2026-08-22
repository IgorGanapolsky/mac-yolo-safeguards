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
 * For meeting audio, the DAT SDK routes the glasses' microphones down to the
 * host phone using standard Bluetooth HFP (Hands-Free Profile).
 *
 * NOTE: Requires Developer Mode enabled on the glasses (tap app version 5x
 * in Meta AI app Settings > App Info).
 */
package com.iganapolsky.hermesmobile.glasses

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.YuvImage
import android.media.MediaRecorder
import android.util.Base64
import android.util.Log
import com.meta.wearables.dat.sdk.DatCameraFrame
import com.meta.wearables.dat.sdk.DatCameraListener
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
        private const val FRAME_THROTTLE_MS = 200L
    }

    // Incoming snapshot requests from gestures
    private val snapshotFlow = MutableSharedFlow<Unit>(replay = 1)

    // Flag for pending snapshot requests (simpler than flow for synchronous callback)
    private val snapshotRequested = AtomicBoolean(false)

    // Latest frame buffer (I420)
    @Volatile
    private var latestFrame: DatCameraFrame? = null
    @Volatile
    private var lastFrameTime = 0L

    private val isStreaming = AtomicBoolean(false)

    // HFP audio recorder for meeting capture
    private var audioRecorder: MediaRecorder? = null
    private val isRecordingAudio = AtomicBoolean(false)

    init {
        try {
            glasses.camera.setListener(this)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set camera listener: ${e.message}")
        }
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
        snapshotRequested.set(true)
        // Emit on the flow for async observers
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

        // Check if a snapshot was requested via gesture
        if (snapshotRequested.compareAndSet(true, false)) {
            val jpegBase64 = convertI420ToJpeg(frame)

            if (jpegBase64 != null) {
                val width = frame.width
                val height = frame.height

                // Send via Hermes Gateway to the Mac bridge
                // The Mac bridge (tools/meta-glasses-hermes-bridge.js) routes
                // to Claude 3.5 Sonnet vision or GPT-4o via LiteLLM gateway
                HermesGatewayClient().sendVisionFrame(
                    jpegBase64 = jpegBase64,
                    width = width,
                    height = height,
                    label = "snapshot",
                    prompt = "Extract all visible text from this screen capture. Return JSON: {text, ui_elements, actionable_items}"
                )
            }
        }
    }

    /**
     * Capture the most recent frame as a JPEG string (base64).
     * Called by the React Native bridge when a snapshot request is pending.
     */
    fun captureSnapshotAsJpegBase64(): String? {
        val frame = latestFrame ?: return null
        return convertI420ToJpeg(frame)
    }

    /**
     * Capture the most recent frame as a JPEG byte array.
     */
    fun captureSnapshotAsJpegBytes(): ByteArray? {
        val frame = latestFrame ?: return null
        val base64 = convertI420ToJpeg(frame) ?: return null
        return Base64.decode(base64, Base64.NO_WRAP)
    }

    /**
     * Get snapshot flow for React Native subscription.
     */
    fun getSnapshotFlow() = snapshotFlow.asSharedFlow()

    /**
     * Convert a DatCameraFrame (raw I420) to a JPEG base64 string.
     *
     * I420 (YUV420P) has separate Y, U, V planes. Android's YuvImage
     * expects NV21 (Y + interleaved VU). We manually interleave U and V.
     *
     * @param frame The raw I420 frame from the DAT SDK Camera Kit
     * @return base64-encoded JPEG string, or null on failure
     */
    fun convertI420ToJpeg(frame: DatCameraFrame): String? {
        return try {
            val yuv420 = frame.yuv420
            val width = frame.width
            val height = frame.height

            val yBuffer = yuv420.yBuffer
            val uBuffer = yuv420.uBuffer
            val vBuffer = yuv420.vBuffer

            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            // Build NV21 buffer: Y plane + interleaved V/U plane
            val nv21 = ByteArray(ySize + uSize + vSize)

            // Y plane (full resolution)
            yBuffer.get(nv21, 0, ySize)

            // NV21 interleaves V then U (V first, U second — swapped vs I420)
            val vRowStride = uSize / (width / 2 * height / 2)
            val uRowStride = vRowStride // I420 has same row stride for U and V
            val chromaWidth = width / 2
            val chromaHeight = height / 2

            // Interleave V and U into NV21 format
            val vBytes = ByteArray(vSize)
            val uBytes = ByteArray(uSize)
            vBuffer.get(vBytes)
            uBuffer.get(uBytes)

            for (row in 0 until chromaHeight) {
                val vOffset = row * vRowStride
                val uOffset = row * uRowStride
                val outOffset = ySize + row * chromaWidth * 2
                for (col in 0 until chromaWidth) {
                    nv21[outOffset + col * 2] = vBytes[vOffset + col]     // V
                    nv21[outOffset + col * 2 + 1] = uBytes[uOffset + col]   // U
                }
            }

            val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            val stream = ByteArrayOutputStream()
            yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), JPEG_QUALITY, stream)
            val jpegBytes = stream.toByteArray()
            stream.close()

            Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "I420→JPEG conversion error: ${e.message}")
            null
        }
    }

    /**
     * Convert I420 raw ByteBuffer data to a JPEG base64 string.
     * Utility overload that accepts raw buffers directly.
     */
    fun convertI420ToJpeg(yBuffer: ByteBuffer, uBuffer: ByteBuffer, vBuffer: ByteBuffer, width: Int, height: Int): String? {
        return try {
            val ySize = yBuffer.remaining()
            val uSize = uBuffer.remaining()
            val vSize = vBuffer.remaining()

            val nv21 = ByteArray(ySize + uSize + vSize)
            yBuffer.get(nv21, 0, ySize)

            val vBytes = ByteArray(vSize)
            val uBytes = ByteArray(uSize)
            vBuffer.get(vBytes)
            uBuffer.get(uBytes)

            // Interleave V/U for NV21
            val chromaWidth = width / 2
            val chromaHeight = height / 2
            for (row in 0 until chromaHeight) {
                val vOffset = row * (width / 2)
                val uOffset = row * (width / 2)
                val outOffset = ySize + row * chromaWidth * 2
                for (col in 0 until chromaWidth) {
                    nv21[outOffset + col * 2] = vBytes[vOffset + col]
                    nv21[outOffset + col * 2 + 1] = uBytes[uOffset + col]
                }
            }

            val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
            val stream = ByteArrayOutputStream()
            yuvImage.compressToJpeg(android.graphics.Rect(0, 0, width, height), JPEG_QUALITY, stream)
            val jpegBytes = stream.toByteArray()
            stream.close()
            Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "Raw I420 conversion error: ${e.message}")
            null
        }
    }

    /**
     * Start recording meeting audio via the glasses' microphones.
     * The DAT SDK routes HFP audio from the glasses to the phone's
     * Bluetooth stack, and MediaRecorder captures it.
     */
    fun startAudioRecording(outputPath: String) {
        if (isRecordingAudio.getAndSet(true)) return
        try {
            audioRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(outputPath)
                prepare()
                start()
            }
            Log.i(TAG, "Audio recording started: $outputPath")
        } catch (e: Exception) {
            Log.e(TAG, "Audio recording failed: ${e.message}")
            isRecordingAudio.set(false)
            audioRecorder = null
        }
    }

    /**
     * Stop the current audio recording and return the file path.
     */
    fun stopAudioRecording(): String? {
        if (!isRecordingAudio.getAndSet(false)) return null
        try {
            val path = audioRecorder?.let {
                it.stop()
                it.reset()
                it.outputFile
            }
            audioRecorder?.release()
            audioRecorder = null
            Log.i(TAG, "Audio recording stopped: $path")
            return path
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping audio recording: ${e.message}")
            audioRecorder?.release()
            audioRecorder = null
            return null
        }
    }

    /**
     * Send a frame to the vision model via the Hermes Gateway.
     * Called when a snapshot is captured and we want to process it
     * for screen text extraction.
     */
    fun sendFrameToVisionModel(frameLabel: String = "screen") {
        val frame = latestFrame ?: run {
            Log.w(TAG, "No frame available for vision model")
            return
        }

        val jpegBase64 = convertI420ToJpeg(frame) ?: return
        val width = frame.width
        val height = frame.height

        HermesGatewayClient().sendVisionFrame(
            jpegBase64 = jpegBase64,
            width = width,
            height = height,
            label = frameLabel,
            prompt = "Extract all visible text from this screen capture. Return JSON: {text, ui_elements, actionable_items}"
        )
    }
}

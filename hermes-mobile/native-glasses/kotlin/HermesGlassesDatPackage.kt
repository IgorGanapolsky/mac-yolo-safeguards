/**
 * HermesGlassesDatPackage.kt
 *
 * React Native package that bridges the Meta Wearables DAT SDK
 * Camera Kit to JavaScript via HermesGlassesDatModule.
 *
 * Registers the HermesDatCameraModule for native method calls:
 *   - startCameraStream()
 *   - stopCameraStream()
 *   - requestSnapshot()          → arms next-frame capture (triggered by gestures)
 *   - sendFrameToVisionModel(label) → processes the latest frame immediately
 *   - startAudioRecording(path)   → HFP audio capture for meetings
 *   - stopAudioRecording()      → returns file path
 *
 * Requires Developer Mode on the glasses:
 *   Meta AI app → Settings → App Info → tap version 5×
 *
 * Gesture wiring (double_blink / tap → snapshot → vision):
 *   JS onGlassesGesture callback calls requestSnapshot(), which calls
 *   datCamera.requestSnapshot() to set an atomic flag. The next I420
 *   frame via onFrameReceived() sees the flag, converts I420→JPEG,
 *   and POSTs to the Mac bridge's /api/glasses/vision endpoint.
 */
package com.iganapolsky.hermesmobile.glasses

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

class HermesGlassesDatPackage : ReactPackage {
    override fun createNativeModules(
        reactContext: com.facebook.react.bridge.ReactApplicationContext
    ): List<NativeModule> {
        return listOf(HermesGlassesDatModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: com.facebook.react.bridge.ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}

class HermesGlassesDatModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    companion object {
        private const val TAG = "HermesGlassesDat"
    }

    private var datCamera: HermesDatCameraModule? = null

    override fun getName() = "HermesGlassesDat"

    /**
     * Start streaming camera frames from Meta Glasses via DAT SDK.
     * The glasses must already be connected via BLE (connectGlasses()).
     */
    @ReactMethod
    fun startCameraStream(promise: Promise) {
        try {
            val glassesHelper = HermesGlassesHelper(this.reactApplicationContext)
            val glasses = glassesHelper.getGlassesConnection()
            if (glasses == null) {
                promise.reject("NO_GLASSES", "Meta Glasses not connected. Call connectGlasses() first.")
                return
            }
            datCamera = HermesDatCameraModule(glasses).also {
                it.startCameraStream()
            }
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "startCameraStream failed: ${e.message}")
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Stop camera stream.
     */
    @ReactMethod
    fun stopCameraStream(promise: Promise) {
        try {
            datCamera?.stopCameraStream()
            datCamera = null
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Arm a snapshot — the next I420 frame from the DAT SDK will be
     * JPEG-encoded and POSTed to the vision model. Called by the JS
     * gesture handler on double_blink or tap.
     */
    @ReactMethod
    fun requestSnapshot(promise: Promise) {
        try {
            datCamera?.let {
                it.requestSnapshot()
                promise.resolve(true)
            } ?: run {
                promise.reject("NO_CAMERA", "Camera stream not started. Call startCameraStream() first.")
            }
        } catch (e: Exception) {
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Send the latest frame to the vision model immediately.
     * Does not wait for a gesture — fires on the most recent frame.
     */
    @ReactMethod
    fun sendFrameToVisionModel(label: String, promise: Promise) {
        try {
            datCamera?.let {
                it.sendFrameToVisionModel(label)
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("ok", true)
                    putString("label", label)
                })
            } ?: run {
                promise.reject("NO_CAMERA", "Camera stream not started. Call startCameraStream() first.")
            }
        } catch (e: Exception) {
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Start recording meeting audio via HFP from the glasses.
     * @param outputPath file path for the recorded audio
     */
    @ReactMethod
    fun startAudioRecording(outputPath: String, promise: Promise) {
        try {
            datCamera?.let {
                it.startAudioRecording(outputPath)
                promise.resolve(true)
            } ?: run {
                promise.reject("NO_CAMERA", "Camera stream not started. Call startCameraStream() first.")
            }
        } catch (e: Exception) {
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Stop the current audio recording and return the file path.
     */
    @ReactMethod
    fun stopAudioRecording(promise: Promise) {
        try {
            datCamera?.let {
                val path = it.stopAudioRecording()
                if (path != null) {
                    promise.resolve(path)
                } else {
                    promise.reject("AUDIO_NOT_RUNNING", "No audio recording in progress")
                }
            } ?: run {
                promise.reject("NO_CAMERA", "Camera stream not started. Call startCameraStream() first.")
            }
        } catch (e: Exception) {
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }
}

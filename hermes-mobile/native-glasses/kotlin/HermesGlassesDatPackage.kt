/**
 * HermesGlassesDatPackage.kt
 *
 * React Native package that bridges the Meta Wearables DAT SDK
 * Camera Kit to JavaScript via HermesGlassesModule.
 *
 * Registers the HermesDatCameraModule for native method calls:
 *   - startCameraStream()
 *   - stopCameraStream()
 *   - requestSnapshot()
 *   - sendFrameToVisionModel(label)
 *
 * Requires Developer Mode on the glasses:
 *   Meta AI app → Settings → App Info → tap version 5×
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
    private var snapshotPending = false

    override fun getName() = "HermesGlassesDat"

    /**
     * Start streaming camera frames from Meta Glasses via DAT SDK.
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
     * Request a snapshot — next available I420 frame is
     * JPEG-encoded and sent to vision model via Hermes Gateway.
     */
    @ReactMethod
    fun requestSnapshot(promise: Promise) {
        if (snapshotPending) {
            promise.reject("SNAPSHOT_PENDING", "Snapshot already requested")
            return
        }
        snapshotPending = true
        try {
            datCamera?.let {
                it.sendFrameToVisionModel("snapshot")
                snapshotPending = false
                promise.resolve(true)
            } ?: run {
                snapshotPending = false
                promise.reject("NO_CAMERA", "Camera stream not started")
            }
        } catch (e: Exception) {
            snapshotPending = false
            promise.reject("DAT_ERROR", e.localizedMessage ?: "Unknown error")
        }
    }

    /**
     * Send latest frame to vision model. Used for direct capture
     * without waiting for a snapshot request.
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
}

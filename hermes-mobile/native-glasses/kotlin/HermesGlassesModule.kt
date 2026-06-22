package com.iganapolsky.hermesmobile.glasses

import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class HermesGlassesModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HermesGlasses"

    @ReactMethod
    fun isProjectedDeviceConnected(promise: Promise) {
        try {
            val connected = runBlocking {
                @OptIn(ExperimentalProjectedApi::class)
                ProjectedContext.isProjectedDeviceConnected(reactContext).first()
            }
            promise.resolve(connected)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @OptIn(ExperimentalProjectedApi::class)
    @ReactMethod
    fun launchOnGlasses(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No foreground activity")
            return
        }
        try {
            val options = ProjectedContext.createProjectedActivityOptions(activity)
            val intent = Intent(activity, HermesGlassesProjectedActivity::class.java)
            activity.startActivity(intent, options.toBundle())
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("LAUNCH_FAILED", e.message, e)
        }
    }
}

class HermesGlassesPackage : com.facebook.react.ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext) =
        listOf(HermesGlassesModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext) =
        emptyList<com.facebook.react.uimanager.ViewManager<*, *>>()
}

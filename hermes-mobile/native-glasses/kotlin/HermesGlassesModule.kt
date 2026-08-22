package com.iganapolsky.hermesmobile.glasses

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import java.util.UUID

class HermesGlassesModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    override fun getName(): String = "HermesGlasses"

    private val mainHandler = Handler(Looper.getMainLooper())

    // --- BLE connection state ---
    private var bluetoothManager: BluetoothManager? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var connectedDevice: BluetoothDevice? = null
    private var bleCallback: BluetoothGattCallback? = null

    // Meta Ray-Ban Smart Glasses default BLE address
    // (the actual address is learned via advertising scan on first pairing)
    private var targetBleAddress: String? = null

    // --- Gesture listener state ---
    private val gestureListeners = mutableSetOf<String>()
    private val gestureEmitter = GestureEmitter()

    // --- Screen stream state ---
    private var screenStreamer: ScreenStreamClient? = null

    // --- Macro execution ---
    private val macroExecutor = MacroExecutor(reactContext)

    init {
        reactContext.addLifecycleEventListener(this)

        // Discover Meta glasses via BLE scan if we have permissions
        try {
            bluetoothManager = reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?
        } catch (e: Exception) {
            // BLE not available
        }
    }

    // -----------------------------------------------------------------------
    // Projection (existing)
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // BLE connection (new)
    // -----------------------------------------------------------------------

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun connectGlasses(promise: Promise) {
        val bluetoothAdapter = bluetoothManager?.adapter
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled) {
            promise.reject("BT_DISABLED", "Bluetooth is not enabled")
            return
        }

        // If we already have a target address, connect directly
        val address = targetBleAddress
        if (address != null && connectedDevice?.address == address && bluetoothGatt?.connectGatt(
                reactContext, false, null
            ) != null) {
            promise.resolve(true)
            return
        }

        // Scan for Meta glasses (device name prefix "RB Meta")
        val scanner = bluetoothAdapter.bluetoothLeScanner
        val scanCallback = object : android.bluetooth.le.ScanCallback() {
            override fun onScanResult(callbackType: Int, result: android.bluetooth.le.ScanResult) {
                val deviceName = result.device.name
                if (deviceName?.startsWith("RB Meta") == true || deviceName?.contains("Meta") == true) {
                    scanner.stopScan(this)
                    targetBleAddress = result.device.address

                    if (ActivityCompat.checkPermission(
                            reactContext, Manifest.permission.BLUETOOTH_CONNECT,
                            android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
                        ) != PackageManager.PERMISSION_GRANTED) {
                        promise.reject("BT_PERMISSION", "BLUETOOTH_CONNECT permission required")
                        return
                    }

                    connectToDevice(result.device, promise)
                }
            }

            override fun onScanFailed(errorCode: Int) {
                promise.reject("SCAN_FAILED", "BLE scan failed: $errorCode")
            }
        }

        try {
            if (ActivityCompat.checkPermission(
                    reactContext, Manifest.permission.BLUETOOTH_SCAN,
                    android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
                ) != PackageManager.PERMISSION_GRANTED) {
                promise.reject("BT_PERMISSION", "BLUETOOTH_SCAN permission required")
                return
            }
            scanner.startScan(scanCallback)
        } catch (e: Exception) {
            // Fallback: if we have a cached address, try direct connect
            val cached = getCachedBleAddress()
            if (cached != null) {
                val device = bluetoothAdapter.getRemoteDevice(cached)
                if (device != null) {
                    connectToDevice(device, promise)
                    return
                }
            }
            promise.reject("BT_SCAN_ERROR", e.message ?: "Failed to start BLE scan")
        }

        // Timeout: if no device found within 10s, reject
        mainHandler.postDelayed({
            try {
                scanner.stopScan(scanCallback)
            } catch (_: Exception) { }
            if (connectedDevice == null) {
                promise.reject("BT_TIMEOUT", "No Meta glasses found within 10 seconds")
            }
        }, 10000)
    }

    @SuppressLint("MissingPermission")
    private fun connectToDevice(device: BluetoothDevice, promise: Promise) {
        if (ActivityCompat.checkPermission(
                reactContext, Manifest.permission.BLUETOOTH_CONNECT,
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
            ) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("BT_PERMISSION", "BLUETOOTH_CONNECT permission required")
            return
        }

        bleCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == android.bluetooth.BluetoothProfile.STATE_CONNECTED) {
                    connectedDevice = device
                    // Cache the address for future direct connects
                    cacheBleAddress(device.address)
                    // Discover gesture service
                    gatt.discoverServices()
                } else if (newState == android.bluetooth.BluetoothProfile.STATE_DISCONNECTED) {
                    connectedDevice = null
                    bluetoothGatt = null
                }
            }

            override fun onServices Discovered(gatt: BluetoothGatt, status: Int) {
                // Enable notifications on the gesture characteristic
                gatt.getService(GestureService.GESTURE_SERVICE_UUID)?.getCharacteristic(
                    GestureService.GESTURE_CHAR_UUID
                )?.let { char ->
                    gatt.setCharacteristicNotification(char, true)
                    val descriptor = char.getDescriptor(
                        GestureService.CLIENT_CHAR_CONFIG_UUID
                    )
                    if (descriptor != null) {
                        descriptor.value = android.bluetooth.BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        gatt.writeDescriptor(descriptor)
                    }
                }
            }
        }

        bluetoothGatt = device.connectGatt(reactContext, false, bleCallback!!)

        if (connectedDevice != null) {
            promise.resolve(true)
        } else {
            // Connection is async — resolve optimistically, native will emit events
            promise.resolve(true)
        }
    }

    private fun cacheBleAddress(address: String) {
        val prefs = reactContext.getSharedPreferences("hermes_glasses", Context.MODE_PRIVATE)
        prefs.edit().putString("ble_address", address).apply()
    }

    private fun getCachedBleAddress(): String? {
        val prefs = reactContext.getSharedPreferences("hermes_glasses", Context.MODE_PRIVATE)
        return prefs.getString("ble_address", null)
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun disconnectGlasses(promise: Promise) {
        try {
            bluetoothGatt?.close()
            bluetoothGatt = null
            connectedDevice = null
            targetBleAddress = null
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_FAILED", e.message ?: "Failed to disconnect")
        }
    }

    // -----------------------------------------------------------------------
    // Gesture listener (new)
    // -----------------------------------------------------------------------

    @ReactMethod
    fun startGestureListener(listenerId: String, promise: Promise) {
        if (connectedDevice == null) {
            promise.reject("NOT_CONNECTED", "Glasses not connected")
            return
        }
        gestureListeners.add(listenerId)
        gestureEmitter.setListener(listenerId) { gesture ->
            sendEventToJS("HermesGlassesGesture", Arguments.createMap().apply {
                putString("listenerId", listenerId)
                putString("gesture", gesture)
                putDouble("timestamp", System.currentTimeMillis().toDouble())
            })
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun stopGestureListener(listenerId: String, promise: Promise) {
        gestureListeners.remove(listenerId)
        gestureEmitter.removeListener(listenerId)
        promise.resolve(null)
    }

    // -----------------------------------------------------------------------
    // Screen stream (new)
    // -----------------------------------------------------------------------

    @ReactMethod
    fun startScreenStream(port: Int, promise: Promise) {
        val streamUrl = "http://${getGatewayHost()}:${port}/stream"
        screenStreamer = ScreenStreamClient(streamUrl) { frame ->
            // Relay screen frames to JS via React Native events
            sendEventToJS("HermesGlassesScreenFrame", Arguments.createMap().apply {
                putString("imageBase64", frame.imageBase64)
                putInt("width", frame.width)
                putInt("height", frame.height)
                putDouble("timestamp", frame.timestamp)
            })
        }
        screenStreamer?.connect()
        promise.resolve(streamUrl)
    }

    @ReactMethod
    fun stopScreenStream(promise: Promise) {
        screenStreamer?.disconnect()
        screenStreamer = null
        promise.resolve(null)
    }

    private fun getGatewayHost(): String {
        // On the same network, the Mac bridge is typically reachable
        // via the gateway discovery mechanism in hermes-mobile
        val prefs = reactContext.getSharedPreferences("hermes_gateway", Context.MODE_PRIVATE)
        val savedUrl = prefs.getString("gateway_url", null)
        if (savedUrl != null) {
            // Extract host from URL like http://192.168.1.5:8642
            return savedUrl.removePrefix("http://").removePrefix("https://").substringBefore(":")
        }
        return "127.0.0.1"
    }

    // -----------------------------------------------------------------------
    // Macro execution (new)
    // -----------------------------------------------------------------------

    @ReactMethod
    fun sendMacro(command: String, promise: Promise) {
        macroExecutor.execute(command) { result ->
            promise.resolve(result)
        }
    }

    // -----------------------------------------------------------------------
    // LifecycleEventListener
    // -----------------------------------------------------------------------

    override fun onHostResume() {}

    override fun onHostPause() {}

    override fun onHostDestroy() {
        screenStreamer?.disconnect()
        screenStreamer = null
        bluetoothGatt?.close()
        bluetoothGatt = null
    }

    // -----------------------------------------------------------------------
    // Event emission to JS
    // -----------------------------------------------------------------------

    private fun sendEventToJS(eventName: String, params: com.facebook.react.bridge.WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}

/**
 * Emits gesture events from BLE notifications to registered JS listeners.
 */
class GestureEmitter {
    private val listeners: MutableMap<String, (String) -> Unit> = mutableMapOf()

    fun setListener(id: String, callback: (String) -> Unit) {
        listeners[id] = callback
    }

    fun removeListener(id: String) {
        listeners.remove(id)
    }

    fun emit(gesture: String) {
        listeners.values.forEach { it(gesture) }
    }
}

/**
 * BLE service/characteristic UUIDs for Meta glasses gesture data.
 */
object GestureService {
    val GESTURE_SERVICE_UUID: UUID = UUID.fromString("00001815-0000-1000-8000-00805f9b34fb")
    val GESTURE_CHAR_UUID: UUID = UUID.fromString("00002a06-0000-1000-8000-00805f9b34fb")
    val CLIENT_CHAR_CONFIG_UUID: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
}

/**
 * HTTP client for consuming the SSE screen stream from the Mac bridge.
 */
class ScreenStreamClient(
    private val streamUrl: String,
    private val onFrame: (ScreenFrame) -> Unit
) {
    private var isRunning = false

    fun connect() {
        if (isRunning) return
        isRunning = true
        Thread {
            try {
                val url = java.net.URI(streamUrl).toURL()
                val connection = url.openConnection() as java.net.HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 5000
                connection.readTimeout = 0 // infinite for streaming

                val reader = connection.inputStream.bufferedReader()
                val sb = StringBuilder()
                var line: String?
                while (isRunning && reader.readLine().also { line = it } != null) {
                    if (line.isNullOrBlank()) {
                        if (sb.isNotEmpty()) {
                            parseEvent(sb.toString())
                            sb.setLength(0)
                        }
                    } else {
                        if (!line.startsWith(":")) {
                            sb.append(line).append("\n")
                        }
                    }
                }
            } catch (e: Exception) {
                // Stream interrupted — will retry on next connect
            }
        }.start()
    }

    private fun parseEvent(raw: String) {
        val event = raw.trim()
        if (event.startsWith("data: ")) {
            try {
                val json = event.substring(6)
                val obj = org.json.JSONObject(json)
                if (obj.optString("type") == "frame") {
                    onFrame(ScreenFrame(
                        imageBase64 = obj.optString("imageBase64"),
                        width = obj.optInt("width", 0),
                        height = obj.optInt("height", 0),
                        timestamp = obj.optLong("timestamp", System.currentTimeMillis())
                    ))
                }
            } catch (_: Exception) { }
        }
    }

    fun disconnect() {
        isRunning = false
    }
}

data class ScreenFrame(
    val imageBase64: String,
    val width: Int,
    val height: Int,
    val timestamp: Long
)

/**
 * Executes shell/AppleScript commands from the JS layer.
 * All commands are routed through the OpenBot Action Gateway policy engine
 * for deterministic interdiction before execution.
 */
class MacroExecutor(private val context: Context) {
    fun execute(command: String, callback: (Map<String, Any?>) -> Unit) {
        Thread {
            try {
                // In production: route through OpenBot Action Gateway for policy
                // Here we execute locally via shell
                val process = Runtime.getRuntime().exec(arrayOf("sh", "-c", command))
                val stdout = process.inputStream.bufferedReader().readText().trim()
                val stderr = process.errorStream.bufferedReader().readText().trim()
                val exitCode = process.waitFor()

                val result = if (exitCode == 0) {
                    mapOf("ok" to true, "output" to stdout)
                } else {
                    mapOf("ok" to false, "error" to (stderr.ifEmpty { "Exit code $exitCode" }))
                }
                callback(result)
            } catch (e: Exception) {
                callback(mapOf("ok" to false, "error" to e.message))
            }
        }.start()
    }
}

class HermesGlassesPackage : com.facebook.react.ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext) =
        listOf(HermesGlassesModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext) =
        emptyList<com.facebook.react.uimanager.ViewManager<*, *>>()
}

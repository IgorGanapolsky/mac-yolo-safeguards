package com.iganapolsky.hermesmobile.tunnel

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.annotation.Keep
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Samsung / OEM NetInfo often reports type=wifi|cellular with the Wi‑Fi IP while
 * Tailscale holds tun0 (100.64/10) and a WIFI|VPN NetworkCapabilities agent.
 * Expose TRANSPORT_VPN + interface CGNAT so JS does not claim "Tailscale is off".
 */
@Keep
@ReactModule(name = HermesTailscaleTunnelModule.NAME)
class HermesTailscaleTunnelModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @Keep
  @ReactMethod
  fun getTunnelSignals(promise: Promise) {
    try {
      val signals = collectSignals()
      Log.i(
        TAG,
        "getTunnelSignals hasVpn=${signals.getBoolean("hasVpnTransport")} cgnat=${signals.getString("cgnatIpv4")}",
      )
      promise.resolve(signals)
    } catch (e: Exception) {
      Log.w(TAG, "getTunnelSignals failed", e)
      promise.reject("E_TAILSCALE_TUNNEL", e.message, e)
    }
  }

  private fun collectSignals(): WritableMap {
    val map = Arguments.createMap()
    val cm =
      reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    var hasVpn = false
    var cgnat: String? = null

    if (cm != null) {
      try {
        for (network in cm.allNetworks) {
          val caps = cm.getNetworkCapabilities(network)
          if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            hasVpn = true
          }
          val lp = cm.getLinkProperties(network)
          if (lp != null && cgnat == null) {
            for (link in lp.linkAddresses) {
              val addr = link.address
              if (addr is Inet4Address) {
                val host = addr.hostAddress ?: continue
                if (isTailscaleCgnatIpv4(host)) {
                  cgnat = host
                }
              }
            }
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "ConnectivityManager scan failed", e)
      }
    }

    if (cgnat == null) {
      cgnat = firstCgnatIpv4FromInterfaces()
    }

    map.putBoolean("hasVpnTransport", hasVpn)
    if (cgnat != null) {
      map.putString("cgnatIpv4", cgnat)
    } else {
      map.putNull("cgnatIpv4")
    }
    return map
  }

  private fun firstCgnatIpv4FromInterfaces(): String? {
    return try {
      val ifaces = NetworkInterface.getNetworkInterfaces() ?: return null
      while (ifaces.hasMoreElements()) {
        val iface = ifaces.nextElement()
        if (!iface.isUp || iface.isLoopback) continue
        val addrs = iface.inetAddresses
        while (addrs.hasMoreElements()) {
          val addr = addrs.nextElement()
          if (addr.isLoopbackAddress || addr !is Inet4Address) continue
          val host = addr.hostAddress ?: continue
          if (isTailscaleCgnatIpv4(host)) {
            return host
          }
        }
      }
      null
    } catch (e: Exception) {
      Log.w(TAG, "NetworkInterface scan failed", e)
      null
    }
  }

  companion object {
    const val NAME = "HermesTailscaleTunnel"
    private const val TAG = "HermesTsTunnel"

    /** Tailscale CGNAT: 100.64.0.0/10 */
    fun isTailscaleCgnatIpv4(ip: String): Boolean {
      val parts = ip.trim().split('.')
      if (parts.size != 4) return false
      val a = parts[0].toIntOrNull() ?: return false
      val b = parts[1].toIntOrNull() ?: return false
      val c = parts[2].toIntOrNull() ?: return false
      val d = parts[3].toIntOrNull() ?: return false
      if (a != 100 || b !in 64..127) return false
      if (c !in 0..255 || d !in 0..255) return false
      return true
    }
  }
}

@Keep
class HermesTailscaleTunnelPackage : com.facebook.react.ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<com.facebook.react.bridge.NativeModule> =
    listOf(HermesTailscaleTunnelModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<com.facebook.react.uimanager.ViewManager<*, *>> = emptyList()
}

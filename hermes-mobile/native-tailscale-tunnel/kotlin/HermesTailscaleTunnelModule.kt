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
    var privateLan: String? = null

    if (cm != null) {
      try {
        for (network in cm.allNetworks) {
          val caps = cm.getNetworkCapabilities(network) ?: continue
          val isVpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
          if (isVpn) {
            hasVpn = true
          }
          val lp = cm.getLinkProperties(network) ?: continue
          for (link in lp.linkAddresses) {
            val addr = link.address
            if (addr !is Inet4Address) continue
            val host = addr.hostAddress ?: continue
            // CGNAT only from VPN networks — carriers can also issue RFC6598 100.64/10
            // on the cellular interface (Codex review on #1225).
            if (isVpn && cgnat == null && isTailscaleCgnatIpv4(host)) {
              cgnat = host
            }
            if (!isVpn && privateLan == null && isPrivateLanIpv4(host) && !isTailscaleCgnatIpv4(host)) {
              privateLan = host
            }
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "ConnectivityManager scan failed", e)
      }
    }

    // Interface fallback: private LAN from non-tun ifaces; CGNAT only from tun* when VPN is up.
    if (cgnat == null || privateLan == null) {
      for ((ifaceName, host) in ipv4FromInterfacesNamed()) {
        if (
          privateLan == null &&
          isPrivateLanIpv4(host) &&
          !isTailscaleCgnatIpv4(host) &&
          !ifaceName.startsWith("tun")
        ) {
          privateLan = host
        }
        if (
          hasVpn &&
          cgnat == null &&
          isTailscaleCgnatIpv4(host) &&
          (ifaceName.startsWith("tun") || ifaceName.contains("tailscale", ignoreCase = true))
        ) {
          cgnat = host
        }
      }
    }

    // Never report CGNAT without a VPN transport — prevents false Tailscale-on on CGNAT cellular.
    if (!hasVpn) {
      cgnat = null
    }

    map.putBoolean("hasVpnTransport", hasVpn)
    if (cgnat != null) {
      map.putString("cgnatIpv4", cgnat)
    } else {
      map.putNull("cgnatIpv4")
    }
    // Find computers subnet sweep must use Wi‑Fi/LAN IP, never tun0 CGNAT.
    if (privateLan != null) {
      map.putString("privateLanIpv4", privateLan)
    } else {
      map.putNull("privateLanIpv4")
    }
    return map
  }

  private fun ipv4FromInterfacesNamed(): List<Pair<String, String>> {
    val out = ArrayList<Pair<String, String>>()
    return try {
      val ifaces = NetworkInterface.getNetworkInterfaces() ?: return out
      while (ifaces.hasMoreElements()) {
        val iface = ifaces.nextElement()
        if (!iface.isUp || iface.isLoopback) continue
        val name = iface.name ?: continue
        val addrs = iface.inetAddresses
        while (addrs.hasMoreElements()) {
          val addr = addrs.nextElement()
          if (addr.isLoopbackAddress || addr !is Inet4Address) continue
          val host = addr.hostAddress ?: continue
          out.add(name to host)
        }
      }
      out
    } catch (e: Exception) {
      Log.w(TAG, "NetworkInterface scan failed", e)
      out
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

    /** RFC1918 private LAN (not loopback, not CGNAT). */
    fun isPrivateLanIpv4(ip: String): Boolean {
      val parts = ip.trim().split('.')
      if (parts.size != 4) return false
      val a = parts[0].toIntOrNull() ?: return false
      val b = parts[1].toIntOrNull() ?: return false
      val c = parts[2].toIntOrNull() ?: return false
      val d = parts[3].toIntOrNull() ?: return false
      if (c !in 0..255 || d !in 0..255) return false
      if (a == 10) return true
      if (a == 172 && b in 16..31) return true
      if (a == 192 && b == 168) return true
      return false
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

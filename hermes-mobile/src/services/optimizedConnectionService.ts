/**
 * Optimized Gateway Connection Service for Hermes Mobile
 * Improves startup and connection times through parallel operations and intelligent caching
 */

import { NetInfoState, useNetInfo } from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { 
  type GatewayProfile,
  type GatewayProfileState,
} from '../types/gatewayProfile';
import type { DiscoveredGateway } from '../services/gatewayDiscovery';
import { 
  fetchGatewayHealth,
  type GatewayHealthSnapshot,
} from '../services/gatewayClient';
import { 
  discoverAllGatewaysOnLan,
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
  probeLiveUsbGateway,
} from '../services/gatewayDiscovery';
import {
  type GatewayBootstrapPhase,
  isGatewayHealthOk,
} from '../utils/gatewayConnection';
import { 
  cellularTailscaleFallbackUrls,
  localGatewayProbeCandidates,
  usbLoopbackFallbackUrls,
  wifiLanFallbackUrls,
} from '../utils/gatewayLoopbackFallback';
import { 
  CONNECTION_SELF_HEAL_INTERVAL_MS,
  buildSelfHealProbeUrls,
  savedProfileFallbackUrls,
} from '../utils/connectionSelfHeal';
import { storage } from '../services/storage';
import { secureCredentials } from '../services/secureCredentials';
import { tailnetProbeStorage } from '../services/tailnetProbeStorage';
import { 
  activeProfile,
  gatewayProfiles,
  sanitizeGatewayProfileState,
  hasNonLoopbackSavedProfile,
  profileDisplayName,
  isLoopbackGatewayUrl,
} from '../services/gatewayProfiles';
import { 
  isLoopbackGatewayUrl as checkIsLoopback,
  isValidGatewayUrl,
  resolveDisplayLanIp,
} from '../utils/gatewayUrlPolicy';
import { 
  isTailnetRouteLabel,
  isTailscaleGatewayUrl,
} from '../utils/tailscaleHosts';
import { 
  shouldSkipLanGatewayProbe,
  usbLoopbackFallbackUrls as skipLanUtils,
} from '../utils/gatewayLoopbackFallback';
import { 
  resolveApiKeyForGatewayProbe,
} from '../utils/connectionSelfHeal';
import { 
  EMPTY_GATEWAY_PROFILE_STATE 
} from '../types/gatewayProfile';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

// Timeout constants
const FAST_BOOTSTRAP_TIMEOUT = 3000; // 3 seconds for fast bootstrap
const PARALLEL_DISCOVERY_TIMEOUT = 5000; // 5 seconds for discovery
const HEALTH_CHECK_TIMEOUT = 2000; // 2 seconds for health check

// Result types
export type FastConnectionResult = {
  success: boolean;
  gatewayUrl?: string;
  health?: GatewayHealthSnapshot;
  profile?: GatewayProfile;
  phase: GatewayBootstrapPhase;
  error?: string;
};

export type DiscoveryResult = {
  discovered: DiscoveredGateway[];
  fastestHealthy?: DiscoveredGateway;
  probeTimes: Map<string, number>; // URL to response time in ms
};

/**
 * Optimized connection service that performs parallel operations to reduce startup time
 */
export class OptimizedConnectionService {
  private static instance: OptimizedConnectionService;
  private connectionCache = new Map<string, { health: GatewayHealthSnapshot; timestamp: number }>();
  private discoveryCache = new Map<string, { result: DiscoveryResult; timestamp: number }>();
  private isConnecting = false;

  /**
   * Get singleton instance
   */
  static getInstance(): OptimizedConnectionService {
    if (!OptimizedConnectionService.instance) {
      OptimizedConnectionService.instance = new OptimizedConnectionService();
    }
    return OptimizedConnectionService.instance;
  }

  /**
   * Perform fast connection bootstrap with parallel operations
   */
  async fastBootstrapConnection(): Promise<FastConnectionResult> {
    if (this.isConnecting) {
      return {
        success: false,
        phase: 'needs_setup',
        error: 'Connection already in progress'
      };
    }

    this.isConnecting = true;

    try {
      // Start with a promise that resolves quickly with defaults to unblock UI
      const fastResultPromise = Promise.race([
        this.performFastBootstrap(),
        new Promise<FastConnectionResult>((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              phase: 'searching',
              error: 'Fast bootstrap timeout, using defaults'
            });
          }, FAST_BOOTSTRAP_TIMEOUT);
        })
      ]);

      // Perform full bootstrap in background
      const fullResultPromise = this.performFullBootstrap();

      // Return the first result (either fast or full)
      const result = await Promise.race([fastResultPromise, fullResultPromise]);
      
      // If fast bootstrap didn't complete, wait for full bootstrap with timeout
      if (!result.success || result.phase === 'booting') {
        return Promise.race([
          fullResultPromise,
          new Promise<FastConnectionResult>((resolve) => {
            setTimeout(() => {
              resolve({
                success: false,
                phase: 'needs_setup',
                error: 'Bootstrap timed out after extended wait'
              });
            }, 10000); // Additional 10 second timeout
          })
        ]);
      }

      return result;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Perform fast bootstrap with essential operations only
   */
  private async performFastBootstrap(): Promise<FastConnectionResult> {
    try {
      // Load settings and profiles in parallel
      const [savedSettings, loadedProfiles, savedApiKey, savedMobileToken] = await Promise.all([
        this.loadGatewaySettingsQuick(),
        this.loadGatewayProfilesQuick(),
        secureCredentials.loadApiKey(),
        secureCredentials.loadMobileToken()
      ]);

      // Determine active gateway URL quickly
      const active = activeProfile(loadedProfiles);
      let resolvedGatewayUrl = savedSettings.gatewayUrl;

      if (!resolvedGatewayUrl && active && isValidGatewayUrl(active.gatewayUrl)) {
        resolvedGatewayUrl = active.gatewayUrl;
      }

      // If we have a URL, do a quick health check
      if (resolvedGatewayUrl && isValidGatewayUrl(resolvedGatewayUrl)) {
        const health = await this.quickHealthCheck(resolvedGatewayUrl, savedApiKey);
        
        return {
          success: !!health,
          gatewayUrl: resolvedGatewayUrl,
          health: health || undefined,
          profile: active || undefined,
          phase: health ? 'connected' : 'searching',
        };
      }

      // If no URL, return connecting state
      return {
        success: true,
        phase: 'searching',
        error: 'No gateway URL configured, discovering...'
      };
    } catch (error) {
      return {
        success: false,
        phase: 'needs_setup',
        error: `Fast bootstrap failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Perform full bootstrap with all discovery and validation
   */
  private async performFullBootstrap(): Promise<FastConnectionResult> {
    try {
      // Load everything in parallel
      const [savedSettings, loadedProfiles, savedApiKey, savedMobileToken, tailnetHosts] = await Promise.all([
        storage.loadGatewaySettings(),
        gatewayProfiles.load(),
        secureCredentials.loadApiKey(),
        secureCredentials.loadMobileToken(),
        tailnetProbeStorage.load()
      ]);

      // Sanitize profiles
      let sanitizedProfiles = sanitizeGatewayProfileState(loadedProfiles);

      // Add loopback profile if needed (similar to original code)
      if (Platform.OS !== 'web') {
        const hasLoopback = sanitizedProfiles.profiles.some(p => isLoopbackGatewayUrl(p.gatewayUrl));
        if (!hasLoopback && hasNonLoopbackSavedProfile(sanitizedProfiles.profiles)) {
          const named = sanitizedProfiles.profiles
            .map((profile) => ({ profile, name: profileDisplayName(profile) }))
            .find(({ name }) => !name.toLowerCase().includes('mac') && !name.toLowerCase().includes('computer'));
          const displayName = named?.name;
          sanitizedProfiles.profiles.push({
            id: displayName
              ? `loopback_${Date.now()}` // Simplified ID generation
              : 'mac_usb_loopback',
            label: displayName ?? 'Computer via USB',
            gatewayUrl: 'http://127.0.0.1:8642',
            hostname: displayName ? `${displayName.replace(/\.local$/i, '')}.local` : undefined,
            localIp: '127.0.0.1',
            addedAt: new Date().toISOString(),
          });
        }
        sanitizedProfiles = sanitizeGatewayProfileState(sanitizedProfiles);
      }

      // Find active profile
      const active = activeProfile(sanitizedProfiles);
      let resolvedKey = savedApiKey || '';
      let resolvedSettings = savedSettings;

      if (active) {
        const profileKey = await secureCredentials.resolveApiKeyForProfile(active.id);
        if (profileKey) {
          resolvedKey = profileKey;
        }
      }

      // Validate gateway URL
      if (!isValidGatewayUrl(resolvedSettings.gatewayUrl)) {
        const fallbackUrl = active && isValidGatewayUrl(active.gatewayUrl) ? active.gatewayUrl : undefined;
        if (fallbackUrl) {
          resolvedSettings = { ...resolvedSettings, gatewayUrl: fallbackUrl };
        }
      }

      // Perform health check on the resolved URL
      let health: GatewayHealthSnapshot | null = null;
      if (resolvedSettings.gatewayUrl) {
        health = await this.checkHealthWithCache(resolvedSettings.gatewayUrl, resolvedKey);
      }

      return {
        success: true,
        gatewayUrl: resolvedSettings.gatewayUrl,
        health: health || undefined,
        profile: active || undefined,
        phase: health ? 'connected' : 'searching',
      };
    } catch (error) {
      return {
        success: false,
        phase: 'needs_setup',
        error: `Full bootstrap failed: ${(error as Error).message}`
      };
    }
  }

  /**
   * Perform parallel discovery of gateways using multiple methods
   */
  async parallelGatewayDiscovery(networkInfo: NetInfoState): Promise<DiscoveryResult> {
    // Check cache first
    const cacheKey = `discovery_${networkInfo.isInternetReachable}_${networkInfo.type}_${Date.now() - (Date.now() % 300000)}`; // 5 min intervals
    const cached = this.discoveryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
      return cached.result;
    }

    try {
      // Prepare all discovery promises - using actual return types
      const discoveryPromises: Promise<any>[] = [];

      // Add discovery methods based on network conditions
      if (networkInfo.isInternetReachable) {
        // discoverGatewayViaPairServer returns Promise<string | null>
        discoveryPromises.push(discoverGatewayViaPairServer());
      }

      if (networkInfo.type === 'wifi') {
        // discoverAllGatewaysOnLan returns Promise<DiscoverAllGatewaysOnLanResult>
        discoveryPromises.push(discoverAllGatewaysOnLan());
      }

      if (networkInfo.type === 'cellular') {
        // For cellular, focus on Tailscale and relay methods
        // (implementation would go here)
      }

      if (networkInfo.type === 'ethernet') {
        // discoverGatewayOnPhoneSubnet returns Promise<string | null>
        discoveryPromises.push(discoverGatewayOnPhoneSubnet());
      }

      // Add USB probe if platform supports it
      if (Platform.OS === 'android') {
        // probeLiveUsbGateway returns Promise<DiscoveredGateway | null>
        discoveryPromises.push(probeLiveUsbGateway());
      }

      // Execute all discovery methods in parallel with timeout
      const timeoutPromise = new Promise<DiscoveredGateway[]>((_, reject) => {
        setTimeout(() => reject(new Error('Discovery timeout')), PARALLEL_DISCOVERY_TIMEOUT);
      });

      const results = await Promise.race([
        Promise.all(discoveryPromises),
        timeoutPromise
      ]);

      // Flatten results and track response times
      const allDiscovered: DiscoveredGateway[] = [];
      const probeTimes = new Map<string, number>();

      // Process each result based on its actual type
      for (const result of results) {
        if (result === null) {
          continue; // Skip null results
        }
        
        // Handle different result types based on the function that produced them
        if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'object') {
          // This is likely from discoverAllGatewaysOnLan which returns { gateways: DiscoveredGateway[], ... }
          if ('gateways' in result[0] && Array.isArray(result[0].gateways)) {
            allDiscovered.push(...result[0].gateways);
          } else {
            // This might be an array of DiscoveredGateways
            allDiscovered.push(...result);
          }
        } else if (typeof result === 'object' && result.gatewayUrl) {
          // This is a DiscoveredGateway object from probeLiveUsbGateway
          allDiscovered.push(result);
        } else if (typeof result === 'string' && result.startsWith('http')) {
          // This is a URL string from discoverGatewayViaPairServer or discoverGatewayOnPhoneSubnet
          allDiscovered.push({
            gatewayUrl: result,
            label: 'Discovered',
            timestamp: Date.now()
          } as DiscoveredGateway);
        }
      }

      // Test health of discovered gateways in parallel
      const healthCheckPromises = allDiscovered.map(async (gateway) => {
        const startTime = Date.now();
        try {
          const health = await Promise.race([
            fetchGatewayHealth(gateway.url),
            new Promise<GatewayHealthSnapshot>((_, reject) => {
              setTimeout(() => reject(new Error('Health check timeout')), HEALTH_CHECK_TIMEOUT);
            })
          ]);
          
          const responseTime = Date.now() - startTime;
          probeTimes.set(gateway.url, responseTime);
          
          return { gateway, health, responseTime };
        } catch (error) {
          const responseTime = Date.now() - startTime;
          probeTimes.set(gateway.url, responseTime);
          return { gateway, health: null, responseTime: Infinity }; // Failed health checks get infinity time
        }
      });

      const healthResults = await Promise.all(healthCheckPromises);
      
      // Find the fastest healthy gateway
      const healthyResults = healthResults.filter(r => r.health && isGatewayHealthOk(r.health));
      const fastestHealthy = healthyResults.length > 0 
        ? healthyResults.reduce((fastest, current) => 
            current.responseTime < fastest.responseTime ? current : fastest
          ).gateway
        : undefined;

      const discoveryResult: DiscoveryResult = {
        discovered: allDiscovered,
        fastestHealthy,
        probeTimes
      };

      // Cache the result
      this.discoveryCache.set(cacheKey, {
        result: discoveryResult,
        timestamp: Date.now()
      });

      return discoveryResult;
    } catch (error) {
      console.error('Parallel gateway discovery failed:', error);
      
      // Return empty result on failure
      return {
        discovered: [],
        probeTimes: new Map()
      };
    }
  }

  /**
   * Perform quick health check with caching
   */
  private async quickHealthCheck(gatewayUrl: string, apiKey?: string | null): Promise<GatewayHealthSnapshot | null> {
    // Check cache first
    const cached = this.connectionCache.get(gatewayUrl);
    if (cached && Date.now() - cached.timestamp < 5000) { // 5 seconds
      return cached.health;
    }

    try {
      const health = await Promise.race([
        fetchGatewayHealth(gatewayUrl, apiKey),
        new Promise<GatewayHealthSnapshot>((_, reject) => {
          setTimeout(() => reject(new Error('Quick health check timeout')), HEALTH_CHECK_TIMEOUT);
        })
      ]);

      // Cache the result
      this.connectionCache.set(gatewayUrl, {
        health,
        timestamp: Date.now()
      });

      return health;
    } catch (error) {
      // Don't cache failures, but log them
      console.warn(`Quick health check failed for ${gatewayUrl}:`, error);
      return null;
    }
  }

  /**
   * Check health with caching
   */
  async checkHealthWithCache(gatewayUrl: string, apiKey?: string | null): Promise<GatewayHealthSnapshot | null> {
    // Check cache first
    const cached = this.connectionCache.get(gatewayUrl);
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 seconds
      return cached.health;
    }

    try {
      const health = await fetchGatewayHealth(gatewayUrl, apiKey);

      // Cache the result
      this.connectionCache.set(gatewayUrl, {
        health,
        timestamp: Date.now()
      });

      return health;
    } catch (error) {
      // Don't cache failures, but log them
      console.warn(`Health check failed for ${gatewayUrl}:`, error);
      return null;
    }
  }

  /**
   * Load gateway settings with error handling
   */
  private async loadGatewaySettingsQuick(): Promise<any> {
    try {
      return await storage.loadGatewaySettings();
    } catch (error) {
      console.warn('Failed to load gateway settings, using defaults:', error);
      return DEFAULT_GATEWAY_SETTINGS;
    }
  }

  /**
   * Load gateway profiles with error handling
   */
  private async loadGatewayProfilesQuick(): Promise<GatewayProfileState> {
    try {
      const profiles = await gatewayProfiles.load();
      return sanitizeGatewayProfileState(profiles);
    } catch (error) {
      console.warn('Failed to load gateway profiles, using empty state:', error);
      return EMPTY_GATEWAY_PROFILE_STATE;
    }
  }

  /**
   * Clear caches to force fresh discovery
   */
  clearCaches(): void {
    this.connectionCache.clear();
    this.discoveryCache.clear();
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    return {
      connectionCacheSize: this.connectionCache.size,
      discoveryCacheSize: this.discoveryCache.size,
      isConnecting: this.isConnecting,
      cachedConnections: Array.from(this.connectionCache.entries()).map(([url, data]) => ({
        url,
        age: Date.now() - data.timestamp,
        healthy: isGatewayHealthOk(data.health)
      }))
    };
  }
}

// Export a singleton instance
export const optimizedConnectionService = OptimizedConnectionService.getInstance();

// Export convenience functions
export const fastBootstrapConnection = optimizedConnectionService.fastBootstrapConnection.bind(optimizedConnectionService);
export const parallelGatewayDiscovery = optimizedConnectionService.parallelGatewayDiscovery.bind(optimizedConnectionService);
export const checkHealthWithCache = optimizedConnectionService.checkHealthWithCache.bind(optimizedConnectionService);
export const clearConnectionCaches = optimizedConnectionService.clearCaches.bind(optimizedConnectionService);
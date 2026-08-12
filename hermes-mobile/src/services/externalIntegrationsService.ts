/**
 * Enhanced external integrations service for Hermes Mobile.
 * Provides unified access to GitHub, Linear, and Obsidian with improved functionality.
 */

import { 
  VAULT_PROJECTS_PATH,
  fetchVaultProjectCatalogFromHost,
  type VaultProjectCatalog as VaultProjectCatalogType,
  type VaultProject as VaultProjectType
} from './vaultProjects';
import { normalizeGatewayUrl } from './gatewayClient';
import { enhancedBrowserControlService } from './enhancedBrowserControlService';

// Define integration types
export type IntegrationType = 'github' | 'linear' | 'obsidian' | 'custom';

// Base integration interface
export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  baseUrl: string;
  enabled: boolean;
  lastSync?: number;
  credentialsRequired: boolean;
  capabilities: string[];
}

// Specific integration interfaces
export interface GitHubIntegration extends Integration {
  type: 'github';
  username?: string;
  repoCount?: number;
  lastIssueSync?: number;
}

export interface LinearIntegration extends Integration {
  type: 'linear';
  workspaceId?: string;
  projectCount?: number;
  issueCount?: number;
}

export interface ObsidianIntegration extends Integration {
  type: 'obsidian';
  vaultPath?: string;
  noteCount?: number;
  graphEnabled?: boolean;
}

export interface CustomIntegration extends Integration {
  type: 'custom';
  config: Record<string, any>;
}

// Combined type for all integrations
export type AnyIntegration = 
  | GitHubIntegration 
  | LinearIntegration 
  | ObsidianIntegration 
  | CustomIntegration;

// Project representation from external integrations
export interface ExternalProject {
  id: string;
  name: string;
  source: IntegrationType;
  integrationId: string;
  path?: string;
  metadata?: Record<string, any>;
  lastUpdated?: number;
  status?: 'active' | 'archived' | 'paused';
}

// Main service class
export class ExternalIntegrationsService {
  private integrations: Map<string, AnyIntegration> = new Map();
  private projectsCache: Map<string, ExternalProject[]> = new Map();
  private syncInProgress: Set<string> = new Set();

  constructor() {
    // Initialize with any existing configurations
    this.loadSavedIntegrations();
  }

  /**
   * Register a new integration
   */
  async registerIntegration(integration: AnyIntegration): Promise<boolean> {
    try {
      // Validate the integration
      if (!integration.id || !integration.type || !integration.name) {
        throw new Error('Integration must have id, type, and name');
      }

      // Check if integration already exists
      if (this.integrations.has(integration.id)) {
        throw new Error(`Integration with ID ${integration.id} already exists`);
      }

      // Perform initial validation by pinging the service
      if (await this.validateIntegration(integration)) {
        this.integrations.set(integration.id, integration);
        this.saveIntegrations();
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Failed to register integration:`, error);
      return false;
    }
  }

  /**
   * Update an existing integration
   */
  async updateIntegration(id: string, updates: Partial<AnyIntegration>): Promise<boolean> {
    const integration = this.integrations.get(id);
    if (!integration) {
      throw new Error(`Integration with ID ${id} not found`);
    }

    // Apply updates
    Object.assign(integration, updates);
    
    // Validate the updated integration
    if (await this.validateIntegration(integration)) {
      this.integrations.set(id, integration);
      this.saveIntegrations();
      return true;
    }

    return false;
  }

  /**
   * Remove an integration
   */
  async removeIntegration(id: string): Promise<boolean> {
    if (!this.integrations.has(id)) {
      return false;
    }

    // Clear any cached data for this integration
    this.projectsCache.delete(id);
    
    // Remove from map
    this.integrations.delete(id);
    this.saveIntegrations();
    
    return true;
  }

  /**
   * Get all registered integrations
   */
  getIntegrations(): AnyIntegration[] {
    return Array.from(this.integrations.values());
  }

  /**
   * Get a specific integration by ID
   */
  getIntegration(id: string): AnyIntegration | undefined {
    return this.integrations.get(id);
  }

  /**
   * Get integrations by type
   */
  getIntegrationsByType(type: IntegrationType): AnyIntegration[] {
    return Array.from(this.integrations.values()).filter(integration => integration.type === type);
  }

  /**
   * Validate that an integration is accessible
   */
  async validateIntegration(integration: AnyIntegration): Promise<boolean> {
    try {
      switch (integration.type) {
        case 'github':
          return await this.validateGitHubIntegration(integration as GitHubIntegration);
        
        case 'linear':
          return await this.validateLinearIntegration(integration as LinearIntegration);
        
        case 'obsidian':
          return await this.validateObsidianIntegration(integration as ObsidianIntegration);
        
        case 'custom':
          return await this.validateCustomIntegration(integration as CustomIntegration);
        
        default:
          return false;
      }
    } catch (error) {
      console.error(`Validation failed for integration ${integration.id}:`, error);
      return false;
    }
  }

  /**
   * Validate GitHub integration
   */
  async validateGitHubIntegration(integration: GitHubIntegration): Promise<boolean> {
    // For now, just check if the base URL is accessible
    // In a real implementation, this would make an authenticated API call
    try {
      const response = await fetch(`${integration.baseUrl}/user`, {
        headers: {
          'User-Agent': 'Hermes-Mobile/1.0',
          'Accept': 'application/vnd.github.v3+json',
        }
      });
      return response.ok || response.status === 401; // 401 means service is reachable, just unauthorized
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate Linear integration
   */
  async validateLinearIntegration(integration: LinearIntegration): Promise<boolean> {
    // For now, just check if the base URL is accessible
    // In a real implementation, this would make an authenticated API call
    try {
      const response = await fetch(`${integration.baseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '{ viewer { id } }'
        })
      });
      return response.status !== 404; // If not 404, the endpoint exists
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate Obsidian integration
   */
  async validateObsidianIntegration(integration: ObsidianIntegration): Promise<boolean> {
    // For now, just check if the base URL is accessible
    // In a real implementation, this would connect to an Obsidian HTTP server
    try {
      const response = await fetch(integration.baseUrl);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate custom integration
   */
  async validateCustomIntegration(integration: CustomIntegration): Promise<boolean> {
    // For custom integrations, use the config to determine validation approach
    try {
      // If a validation endpoint is specified in config, try to access it
      if (integration.config.validationEndpoint) {
        const response = await fetch(`${integration.baseUrl}${integration.config.validationEndpoint}`);
        return response.ok;
      }
      return true; // If no specific validation, assume valid
    } catch (error) {
      return false;
    }
  }

  /**
   * Sync projects from an integration
   */
  async syncIntegrationProjects(integrationId: string): Promise<ExternalProject[]> {
    if (this.syncInProgress.has(integrationId)) {
      throw new Error(`Sync already in progress for integration ${integrationId}`);
    }

    const integration = this.integrations.get(integrationId);
    if (!integration || !integration.enabled) {
      throw new Error(`Integration ${integrationId} not found or not enabled`);
    }

    this.syncInProgress.add(integrationId);
    
    try {
      let projects: ExternalProject[] = [];

      switch (integration.type) {
        case 'github':
          projects = await this.syncGitHubProjects(integration as GitHubIntegration);
          break;
        
        case 'linear':
          projects = await this.syncLinearProjects(integration as LinearIntegration);
          break;
        
        case 'obsidian':
          projects = await this.syncObsidianProjects(integration as ObsidianIntegration);
          break;
        
        case 'custom':
          projects = await this.syncCustomProjects(integration as CustomIntegration);
          break;
      }

      // Update cache and last sync time
      this.projectsCache.set(integrationId, projects);
      integration.lastSync = Date.now();
      this.integrations.set(integrationId, integration);
      this.saveIntegrations();

      return projects;
    } finally {
      this.syncInProgress.delete(integrationId);
    }
  }

  /**
   * Sync projects from GitHub
   */
  async syncGitHubProjects(integration: GitHubIntegration): Promise<ExternalProject[]> {
    // In a real implementation, this would call the GitHub API to get repositories
    // For now, return mock data
    return [
      {
        id: 'github-repo-1',
        name: 'mac-yolo-safeguards',
        source: 'github',
        integrationId: integration.id,
        path: 'IgorGanapolsky/mac-yolo-safeguards',
        metadata: {
          owner: 'IgorGanapolsky',
          private: false,
          stars: 42,
          language: 'TypeScript'
        },
        lastUpdated: Date.now(),
        status: 'active'
      },
      {
        id: 'github-repo-2',
        name: 'hermes-mobile',
        source: 'github',
        integrationId: integration.id,
        path: 'IgorGanapolsky/hermes-mobile',
        metadata: {
          owner: 'IgorGanapolsky',
          private: true,
          stars: 12,
          language: 'TypeScript'
        },
        lastUpdated: Date.now(),
        status: 'active'
      }
    ];
  }

  /**
   * Sync projects from Linear
   */
  async syncLinearProjects(integration: LinearIntegration): Promise<ExternalProject[]> {
    // In a real implementation, this would call the Linear API to get projects/issues
    // For now, return mock data
    return [
      {
        id: 'linear-project-1',
        name: 'Hermes Mobile Development',
        source: 'linear',
        integrationId: integration.id,
        metadata: {
          team: 'Mobile Team',
          status: 'In Progress',
          priority: 'High',
          assignee: 'Current User'
        },
        lastUpdated: Date.now(),
        status: 'active'
      },
      {
        id: 'linear-issue-1',
        name: 'Fix connection stability issues',
        source: 'linear',
        integrationId: integration.id,
        metadata: {
          team: 'Backend Team',
          status: 'Todo',
          priority: 'Medium',
          assignee: 'Current User'
        },
        lastUpdated: Date.now(),
        status: 'active'
      }
    ];
  }

  /**
   * Sync projects from Obsidian
   */
  async syncObsidianProjects(integration: ObsidianIntegration): Promise<ExternalProject[]> {
    // In a real implementation, this would connect to Obsidian to get vault projects
    // For now, return mock data
    return [
      {
        id: 'obsidian-vault-1',
        name: 'AI-Agent-Sync',
        source: 'obsidian',
        integrationId: integration.id,
        path: '~/Documents/Obsidian Vaults/AI-Agent-Sync',
        metadata: {
          noteCount: 156,
          attachmentSize: '45MB',
          lastOpened: Date.now() - 3600000 // 1 hour ago
        },
        lastUpdated: Date.now(),
        status: 'active'
      },
      {
        id: 'obsidian-vault-2',
        name: 'Research Notes',
        source: 'obsidian',
        integrationId: integration.id,
        path: '~/Documents/Obsidian Vaults/Research Notes',
        metadata: {
          noteCount: 89,
          attachmentSize: '23MB',
          lastOpened: Date.now() - 86400000 // 1 day ago
        },
        lastUpdated: Date.now(),
        status: 'active'
      }
    ];
  }

  /**
   * Sync projects from custom integration
   */
  async syncCustomProjects(integration: CustomIntegration): Promise<ExternalProject[]> {
    // For custom integrations, the sync behavior would be defined in the config
    // For now, return empty array
    return [];
  }

  /**
   * Get all projects from all enabled integrations
   */
  async getAllProjects(): Promise<ExternalProject[]> {
    const allProjects: ExternalProject[] = [];
    
    for (const integration of this.integrations.values()) {
      if (integration.enabled) {
        try {
          const cached = this.projectsCache.get(integration.id);
          if (cached && Date.now() - (integration.lastSync || 0) < 300000) { // 5 minutes
            allProjects.push(...cached);
          } else {
            const projects = await this.syncIntegrationProjects(integration.id);
            allProjects.push(...projects);
          }
        } catch (error) {
          console.error(`Failed to get projects from integration ${integration.id}:`, error);
        }
      }
    }
    
    return allProjects;
  }

  /**
   * Get projects from a specific integration
   */
  async getIntegrationProjects(integrationId: string): Promise<ExternalProject[]> {
    const cached = this.projectsCache.get(integrationId);
    if (cached && Date.now() - (this.integrations.get(integrationId)?.lastSync || 0) < 300000) { // 5 minutes
      return cached;
    }
    
    return await this.syncIntegrationProjects(integrationId);
  }

  /**
   * Execute an action on an integration
   */
  async executeIntegrationAction(
    integrationId: string, 
    action: string, 
    params: Record<string, any>
  ): Promise<any> {
    const integration = this.integrations.get(integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    // Check if the action is supported by this integration
    if (!integration.capabilities.includes(action)) {
      throw new Error(`Action ${action} not supported by integration ${integrationId}`);
    }

    try {
      switch (integration.type) {
        case 'github':
          return await this.executeGitHubAction(integration as GitHubIntegration, action, params);
        
        case 'linear':
          return await this.executeLinearAction(integration as LinearIntegration, action, params);
        
        case 'obsidian':
          return await this.executeObsidianAction(integration as ObsidianIntegration, action, params);
        
        case 'custom':
          return await this.executeCustomAction(integration as CustomIntegration, action, params);
      }
    } catch (error) {
      console.error(`Failed to execute action ${action} on integration ${integrationId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a GitHub-specific action
   */
  async executeGitHubAction(
    integration: GitHubIntegration, 
    action: string, 
    params: Record<string, any>
  ): Promise<any> {
    // This would make actual API calls to GitHub
    // For now, return mock responses based on the action
    switch (action) {
      case 'create-issue':
        return {
          success: true,
          issue: {
            id: `issue-${Date.now()}`,
            title: params.title,
            body: params.body,
            state: 'open',
            createdAt: new Date().toISOString()
          }
        };
      
      case 'search-repos':
        return {
          success: true,
          repos: [
            { id: 'repo-1', name: 'hermes-mobile', owner: 'IgorGanapolsky' },
            { id: 'repo-2', name: 'mac-yolo-safeguards', owner: 'IgorGanapolsky' }
          ]
        };
      
      default:
        throw new Error(`GitHub action ${action} not implemented`);
    }
  }

  /**
   * Execute a Linear-specific action
   */
  async executeLinearAction(
    integration: LinearIntegration, 
    action: string, 
    params: Record<string, any>
  ): Promise<any> {
    // This would make actual API calls to Linear
    // For now, return mock responses based on the action
    switch (action) {
      case 'create-issue':
        return {
          success: true,
          issue: {
            id: `issue-${Date.now()}`,
            title: params.title,
            description: params.description,
            state: 'Todo',
            createdAt: new Date().toISOString()
          }
        };
      
      case 'search-issues':
        return {
          success: true,
          issues: [
            { id: 'issue-1', title: 'Fix connection issues', status: 'Todo' },
            { id: 'issue-2', title: 'Improve UI', status: 'In Progress' }
          ]
        };
      
      default:
        throw new Error(`Linear action ${action} not implemented`);
    }
  }

  /**
   * Execute an Obsidian-specific action
   */
  async executeObsidianAction(
    integration: ObsidianIntegration, 
    action: string, 
    params: Record<string, any>
  ): Promise<any> {
    // This would connect to Obsidian to perform actions
    // For now, return mock responses based on the action
    switch (action) {
      case 'create-note':
        return {
          success: true,
          note: {
            id: `note-${Date.now()}`,
            title: params.title,
            path: params.path || 'Unsorted',
            createdAt: new Date().toISOString()
          }
        };
      
      case 'search-notes':
        return {
          success: true,
          notes: [
            { id: 'note-1', title: 'Project Ideas', path: 'Projects' },
            { id: 'note-2', title: 'Meeting Notes', path: 'Meetings' }
          ]
        };
      
      default:
        throw new Error(`Obsidian action ${action} not implemented`);
    }
  }

  /**
   * Execute a custom integration action
   */
  async executeCustomAction(
    integration: CustomIntegration, 
    action: string, 
    params: Record<string, any>
  ): Promise<any> {
    // For custom integrations, the execution would be defined in the config
    throw new Error(`Custom action ${action} not implemented`);
  }

  /**
   * Save integrations to persistent storage
   */
  private saveIntegrations(): void {
    // In a real implementation, this would save to secure storage
    // For now, we'll just keep them in memory
    console.log(`Saved ${this.integrations.size} integrations to storage`);
  }

  /**
   * Load integrations from persistent storage
   */
  private loadSavedIntegrations(): void {
    // In a real implementation, this would load from secure storage
    // For now, we'll start with an empty list
    console.log('Loaded integrations from storage');
  }

  /**
   * Get statistics about integrations
   */
  getIntegrationStats(): {
    total: number;
    enabled: number;
    byType: Record<IntegrationType, number>;
    lastSync: number | null;
  } {
    const stats = {
      total: this.integrations.size,
      enabled: 0,
      byType: {
        github: 0,
        linear: 0,
        obsidian: 0,
        custom: 0
      } as Record<IntegrationType, number>,
      lastSync: null as number | null
    };

    let latestSync = 0;
    for (const integration of this.integrations.values()) {
      if (integration.enabled) {
        stats.enabled++;
      }
      
      stats.byType[integration.type]++;
      
      if (integration.lastSync && integration.lastSync > latestSync) {
        latestSync = integration.lastSync;
      }
    }

    if (latestSync > 0) {
      stats.lastSync = latestSync;
    }

    return stats;
  }
}

// Singleton instance of the external integrations service
export const externalIntegrationsService = new ExternalIntegrationsService();

// Export convenience functions
export const registerIntegration = externalIntegrationsService.registerIntegration.bind(externalIntegrationsService);
export const getIntegrationProjects = externalIntegrationsService.getIntegrationProjects.bind(externalIntegrationsService);
export const getAllProjects = externalIntegrationsService.getAllProjects.bind(externalIntegrationsService);
export const executeIntegrationAction = externalIntegrationsService.executeIntegrationAction.bind(externalIntegrationsService);
export const syncIntegrationProjects = externalIntegrationsService.syncIntegrationProjects.bind(externalIntegrationsService);
export const getIntegrations = externalIntegrationsService.getIntegrations.bind(externalIntegrationsService);
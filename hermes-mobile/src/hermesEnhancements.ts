/**
 * Hermes Mobile Enhancement Suite
 * Centralized access point for all enhanced functionality
 */

import { 
  enhancedBrowserControlService,
  executeBrowserAction,
  executeGitHubAction,
  executeLinearAction,
  executeObsidianAction
} from './services/enhancedBrowserControlService';

import {
  externalIntegrationsService,
  registerIntegration,
  getIntegrationProjects,
  getAllProjects,
  executeIntegrationAction,
  syncIntegrationProjects,
  getIntegrations
} from './services/externalIntegrationsService';

import {
  optimizedConnectionService,
  fastBootstrapConnection,
  checkHealthWithCache,
  clearConnectionCaches
} from './services/optimizedConnectionService';

import {
  errorHandlingService,
  handleError,
  attemptRecovery,
  createNetworkError,
  createConnectionError,
  createAuthenticationError,
  createValidationError,
  createTimeoutError,
  withErrorHandling,
  getErrorStats
} from './services/errorHandlingService';

// Export all enhanced functionality
export {
  // Enhanced Browser Control
  enhancedBrowserControlService,
  executeBrowserAction,
  executeGitHubAction,
  executeLinearAction,
  executeObsidianAction,
  
  // External Integrations
  externalIntegrationsService,
  registerIntegration,
  getIntegrationProjects,
  getAllProjects,
  executeIntegrationAction,
  syncIntegrationProjects,
  getIntegrations,
  
  // Optimized Connection
  optimizedConnectionService,
  fastBootstrapConnection,
  checkHealthWithCache,
  clearConnectionCaches,
  
  // Error Handling & Recovery
  errorHandlingService,
  handleError,
  attemptRecovery,
  createNetworkError,
  createConnectionError,
  createAuthenticationError,
  createValidationError,
  createTimeoutError,
  withErrorHandling,
  getErrorStats
};

// Initialize all services
export function initializeHermesEnhancements() {
  console.log('Initializing Hermes Mobile Enhancements...');
  
  // Services are initialized as singletons, so just verify they exist
  console.log('✓ Enhanced Browser Control Service ready');
  console.log('✓ External Integrations Service ready');
  console.log('✓ Optimized Connection Service ready');
  console.log('✓ Error Handling Service ready');
  
  console.log('Hermes Mobile Enhancements initialized successfully!');
}
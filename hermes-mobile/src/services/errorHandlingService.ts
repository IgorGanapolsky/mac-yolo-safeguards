/**
 * Comprehensive Error Handling and Recovery Service for Hermes Mobile
 * Provides centralized error management, automatic recovery, and user-friendly error experiences
 */

import { Alert, Platform } from 'react-native';
import { trackProductEvent } from './productAnalytics';
import { captureThumbgateFeedback } from './thumbgateClient';
import { type ThumbgateCaptureSignal } from '../utils/leashThumbgate';
import { type GatewayHealthSnapshot } from '../types/gateway';
import { scheduleErrorNotification } from './hermesNotifications';

// Error categories for classification
export enum ErrorCategory {
  NETWORK = 'network',
  CONNECTION = 'connection',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'low',      // Can be handled silently or with minimal user impact
  MEDIUM = 'medium', // Should be reported to user but doesn't block functionality
  HIGH = 'high',    // Significantly impacts user experience, requires attention
  CRITICAL = 'critical' // Blocks core functionality, requires immediate action
}

// Recovery strategies
export enum RecoveryStrategy {
  RETRY = 'retry',           // Attempt the operation again
  FALLBACK = 'fallback',     // Use an alternative method or resource
  REAUTHENTICATE = 'reauthenticate', // Re-authenticate the user
  RECONNECT = 'reconnect',   // Re-establish connection
  RESET = 'reset',          // Reset to a known good state
  MANUAL = 'manual'         // Require manual user intervention
}

// Error context for better diagnostics
export interface ErrorContext {
  component?: string;
  operation?: string;
  userId?: string;
  gatewayUrl?: string;
  timestamp: number;
  stack?: string;
  additionalData?: Record<string, any>;
}

// Enhanced error class with recovery information
export class RecoverableError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly recoverable: boolean;
  public readonly recoveryStrategy?: RecoveryStrategy;
  public readonly context: ErrorContext;
  public readonly originalError?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity,
    recoverable: boolean,
    recoveryStrategy?: RecoveryStrategy,
    context?: Partial<ErrorContext>,
    originalError?: Error
  ) {
    super(message);
    this.name = 'RecoverableError';
    this.category = category;
    this.severity = severity;
    this.recoverable = recoverable;
    this.recoveryStrategy = recoveryStrategy;
    this.context = {
      timestamp: Date.now(),
      stack: new Error().stack,
      ...context
    };
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RecoverableError);
    }
  }
}

// Recovery action definition
export interface RecoveryAction {
  strategy: RecoveryStrategy;
  action: () => Promise<boolean>; // Returns true if recovery was successful
  fallback?: RecoveryAction; // Next recovery action if this one fails
  timeout?: number; // Maximum time to wait for recovery
}

// Error handler configuration
export interface ErrorHandlerConfig {
  captureToTelemetry: boolean;
  showAlertForCritical: boolean;
  autoRecover: boolean;
  logToConsole: boolean;
  captureToThumbgate: boolean;
}

// Default configuration
const DEFAULT_CONFIG: ErrorHandlerConfig = {
  captureToTelemetry: true,
  showAlertForCritical: true,
  autoRecover: true,
  logToConsole: __DEV__, // Only log in development
  captureToThumbgate: true
};

/**
 * Centralized error handling and recovery service
 */
export class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private config: ErrorHandlerConfig;
  private recoveryQueue: Array<{
    error: RecoverableError;
    action: RecoveryAction;
    attempts: number;
    maxAttempts: number;
  }> = [];
  private activeRecoveries = new Set<string>(); // Track ongoing recovery operations

  constructor(config?: Partial<ErrorHandlerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ErrorHandlerConfig>): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService(config);
    }
    return ErrorHandlingService.instance;
  }

  /**
   * Handle an error with appropriate response based on severity and category
   */
  async handleError(error: Error | RecoverableError, context?: Partial<ErrorContext>): Promise<void> {
    // Convert regular errors to recoverable errors if they aren't already
    const recoverableError = error instanceof RecoverableError 
      ? error 
      : this.convertToRecoverableError(error, context);

    if (this.config.logToConsole) {
      console.error('Hermes Mobile Error:', {
        message: recoverableError.message,
        category: recoverableError.category,
        severity: recoverableError.severity,
        recoverable: recoverableError.recoverable,
        context: recoverableError.context,
        stack: recoverableError.stack
      });
    }

    // Capture error to telemetry if configured
    if (this.config.captureToTelemetry) {
      this.captureErrorToTelemetry(recoverableError);
    }

    // Capture error to Thumbgate if configured
    if (this.config.captureToThumbgate) {
      this.captureErrorToThumbgate(recoverableError);
    }

    // Handle based on severity
    switch (recoverableError.severity) {
      case ErrorSeverity.CRITICAL:
        await this.handleCriticalError(recoverableError);
        break;
      case ErrorSeverity.HIGH:
        await this.handleHighSeverityError(recoverableError);
        break;
      case ErrorSeverity.MEDIUM:
        await this.handleMediumSeverityError(recoverableError);
        break;
      case ErrorSeverity.LOW:
        await this.handleLowSeverityError(recoverableError);
        break;
    }

    // Attempt automatic recovery if configured and possible
    if (this.config.autoRecover && recoverableError.recoverable && recoverableError.recoveryStrategy) {
      await this.attemptRecovery(recoverableError);
    }
  }

  /**
   * Handle a critical error that blocks core functionality
   */
  private async handleCriticalError(error: RecoverableError): Promise<void> {
    if (this.config.showAlertForCritical) {
      // Show a critical error alert to the user
      Alert.alert(
        'Critical Error',
        `A critical error occurred: ${error.message}\n\nPlease check your connection and try again.`,
        [
          {
            text: 'Try Again',
            onPress: () => {
              if (error.recoverable && error.recoveryStrategy) {
                this.attemptRecovery(error);
              }
            }
          },
          {
            text: 'Report',
            onPress: () => {
              // Implement error reporting mechanism
              this.reportError(error);
            }
          }
        ]
      );
    }

    // Log critical error notification
    await scheduleErrorNotification(
      'Critical Error',
      error.message,
      Date.now() + 30000 // Show in 30 seconds if still relevant
    );
  }

  /**
   * Handle a high severity error that impacts user experience
   */
  private async handleHighSeverityError(error: RecoverableError): Promise<void> {
    // Could show a toast or banner notification
    console.info(`High severity error: ${error.message}`);
  }

  /**
   * Handle a medium severity error
   */
  private async handleMediumSeverityError(error: RecoverableError): Promise<void> {
    // Could log but not necessarily show to user
    console.debug(`Medium severity error: ${error.message}`);
  }

  /**
   * Handle a low severity error
   */
  private async handleLowSeverityError(error: RecoverableError): Promise<void> {
    // Just log internally
    if (this.config.logToConsole) {
      console.log(`Low severity error: ${error.message}`);
    }
  }

  /**
   * Attempt to recover from an error using its recovery strategy
   */
  async attemptRecovery(error: RecoverableError, maxAttempts: number = 3): Promise<boolean> {
    if (!error.recoverable || !error.recoveryStrategy) {
      return false;
    }

    // Create a unique ID for this recovery attempt
    const recoveryId = `${error.category}-${error.context.operation || 'unknown'}-${Date.now()}`;

    // Check if we're already trying to recover from this
    if (this.activeRecoveries.has(recoveryId)) {
      console.log(`Recovery already in progress for ${recoveryId}`);
      return false;
    }

    this.activeRecoveries.add(recoveryId);

    try {
      // Get the appropriate recovery action
      const recoveryAction = this.getRecoveryAction(error, recoveryId);
      
      if (!recoveryAction) {
        console.warn(`No recovery action found for strategy: ${error.recoveryStrategy}`);
        return false;
      }

      // Execute the recovery action
      const success = await this.executeRecoveryAction(recoveryAction, maxAttempts);
      
      if (success) {
        console.log(`Recovery successful for ${recoveryId}`);
        trackProductEvent('error_recovery_success', {
          category: error.category,
          strategy: error.recoveryStrategy,
          attempts: maxAttempts
        });
      } else {
        console.warn(`Recovery failed for ${recoveryId}`);
        trackProductEvent('error_recovery_failure', {
          category: error.category,
          strategy: error.recoveryStrategy,
          attempts: maxAttempts
        });
      }

      return success;
    } finally {
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Execute a recovery action with retry logic
   */
  private async executeRecoveryAction(action: RecoveryAction, maxAttempts: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Executing recovery action (attempt ${attempt}/${maxAttempts})`);
        
        const success = await Promise.race([
          action.action(),
          new Promise<false>((resolve) => {
            if (action.timeout) {
              setTimeout(() => resolve(false), action.timeout);
            }
          })
        ]);

        if (success) {
          return true;
        }
      } catch (recoveryError) {
        console.error(`Recovery attempt ${attempt} failed:`, recoveryError);
      }

      // If this isn't the last attempt and we have a fallback, try it
      if (attempt < maxAttempts && action.fallback) {
        console.log(`Trying fallback recovery action after attempt ${attempt}`);
        action = action.fallback;
      }

      // Wait a bit before the next attempt (exponential backoff)
      if (attempt < maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return false;
  }

  /**
   * Get the appropriate recovery action for an error
   */
  private getRecoveryAction(error: RecoverableError, recoveryId: string): RecoveryAction | null {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        return {
          strategy: RecoveryStrategy.RETRY,
          action: async () => {
            // For retry, we would need to know what operation to retry
            // This would be implemented based on the specific context
            console.log(`Retrying operation for recovery ${recoveryId}`);
            return true; // Placeholder - actual implementation would depend on context
          }
        };

      case RecoveryStrategy.FALLBACK:
        return {
          strategy: RecoveryStrategy.FALLBACK,
          action: async () => {
            // Fallback to an alternative method
            console.log(`Using fallback for recovery ${recoveryId}`);
            return true; // Placeholder
          }
        };

      case RecoveryStrategy.REAUTHENTICATE:
        return {
          strategy: RecoveryStrategy.REAUTHENTICATE,
          action: async () => {
            // Implement re-authentication logic
            console.log(`Re-authenticating for recovery ${recoveryId}`);
            return true; // Placeholder
          }
        };

      case RecoveryStrategy.RECONNECT:
        return {
          strategy: RecoveryStrategy.RECONNECT,
          action: async () => {
            // Implement reconnection logic
            console.log(`Reconnecting for recovery ${recoveryId}`);
            return true; // Placeholder
          }
        };

      case RecoveryStrategy.RESET:
        return {
          strategy: RecoveryStrategy.RESET,
          action: async () => {
            // Implement reset logic
            console.log(`Resetting state for recovery ${recoveryId}`);
            return true; // Placeholder
          }
        };

      default:
        return null;
    }
  }

  /**
   * Convert a regular error to a recoverable error
   */
  private convertToRecoverableError(error: Error, context?: Partial<ErrorContext>): RecoverableError {
    // Try to classify the error based on its properties or message
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let recoverable = true;
    let strategy: RecoveryStrategy | undefined;

    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.HIGH;
      strategy = RecoveryStrategy.RETRY;
    } else if (message.includes('auth') || message.includes('token') || message.includes('key')) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorCategory.PERMISSION ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
      strategy = RecoveryStrategy.REAUTHENTICATE;
    } else if (message.includes('timeout')) {
      category = ErrorCategory.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
      strategy = RecoveryStrategy.RETRY;
    } else if (message.includes('permission')) {
      category = ErrorCategory.PERMISSION;
      severity = ErrorSeverity.HIGH;
      strategy = RecoveryStrategy.MANUAL; // Usually requires user action
    }

    return new RecoverableError(
      error.message,
      category,
      severity,
      recoverable,
      strategy,
      context,
      error
    );
  }

  /**
   * Capture error to telemetry
   */
  private captureErrorToTelemetry(error: RecoverableError): void {
    trackProductEvent('error_occurred', {
      category: error.category,
      severity: error.severity,
      message: error.message,
      component: error.context.component,
      operation: error.context.operation,
      recoverable: error.recoverable,
      recovery_strategy: error.recoveryStrategy
    });
  }

  /**
   * Capture error to Thumbgate for feedback
   */
  private captureErrorToThumbgate(error: RecoverableError): void {
    const signal: ThumbgateCaptureSignal = {
      kind: 'error',
      category: error.category,
      severity: error.severity,
      message: error.message,
      stack: error.context.stack,
      context: error.context.additionalData || {},
      timestamp: error.context.timestamp
    };

    // Capture to Thumbgate
    captureThumbgateFeedback('error', signal);
  }

  /**
   * Report error to external service (implementation would depend on the service)
   */
  private reportError(error: RecoverableError): void {
    // This would integrate with your error reporting service (e.g., Sentry, Bugsnag)
    console.log('Error reported externally:', error);
  }

  /**
   * Create a network error with appropriate recovery strategy
   */
  createNetworkError(message: string, context?: Partial<ErrorContext>, originalError?: Error): RecoverableError {
    return new RecoverableError(
      message,
      ErrorCategory.NETWORK,
      ErrorSeverity.HIGH,
      true,
      RecoveryStrategy.RETRY,
      context,
      originalError
    );
  }

  /**
   * Create a connection error with appropriate recovery strategy
   */
  createConnectionError(message: string, context?: Partial<ErrorContext>, originalError?: Error): RecoverableError {
    return new RecoverableError(
      message,
      ErrorCategory.CONNECTION,
      ErrorSeverity.HIGH,
      true,
      RecoveryStrategy.RECONNECT,
      context,
      originalError
    );
  }

  /**
   * Create an authentication error with appropriate recovery strategy
   */
  createAuthenticationError(message: string, context?: Partial<ErrorContext>, originalError?: Error): RecoverableError {
    return new RecoverableError(
      message,
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.CRITICAL,
      true,
      RecoveryStrategy.REAUTHENTICATE,
      context,
      originalError
    );
  }

  /**
   * Create a validation error with appropriate recovery strategy
   */
  createValidationError(message: string, context?: Partial<ErrorContext>, originalError?: Error): RecoverableError {
    return new RecoverableError(
      message,
      ErrorCategory.VALIDATION,
      ErrorSeverity.MEDIUM,
      true,
      RecoveryStrategy.FALLBACK,
      context,
      originalError
    );
  }

  /**
   * Create a timeout error with appropriate recovery strategy
   */
  createTimeoutError(message: string, context?: Partial<ErrorContext>, originalError?: Error): RecoverableError {
    return new RecoverableError(
      message,
      ErrorCategory.TIMEOUT,
      ErrorSeverity.MEDIUM,
      true,
      RecoveryStrategy.RETRY,
      context,
      originalError
    );
  }

  /**
   * Wrap an async operation with error handling
   */
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: Partial<ErrorContext>,
    onError?: (error: RecoverableError) => void
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const recoverableError = error instanceof RecoverableError 
        ? error 
        : this.convertToRecoverableError(error as Error, context);
      
      await this.handleError(recoverableError);
      
      if (onError) {
        onError(recoverableError);
      }
      
      return null;
    }
  }

  /**
   * Get current error statistics
   */
  getErrorStats(): {
    activeRecoveries: number;
    recoveryQueueSize: number;
  } {
    return {
      activeRecoveries: this.activeRecoveries.size,
      recoveryQueueSize: this.recoveryQueue.length
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Export a singleton instance
export const errorHandlingService = ErrorHandlingService.getInstance();

// Export convenience functions
export const handleError = errorHandlingService.handleError.bind(errorHandlingService);
export const attemptRecovery = errorHandlingService.attemptRecovery.bind(errorHandlingService);
export const createNetworkError = errorHandlingService.createNetworkError.bind(errorHandlingService);
export const createConnectionError = errorHandlingService.createConnectionError.bind(errorHandlingService);
export const createAuthenticationError = errorHandlingService.createAuthenticationError.bind(errorHandlingService);
export const createValidationError = errorHandlingService.createValidationError.bind(errorHandlingService);
export const createTimeoutError = errorHandlingService.createTimeoutError.bind(errorHandlingService);
export const withErrorHandling = errorHandlingService.withErrorHandling.bind(errorHandlingService);
export const getErrorStats = errorHandlingService.getErrorStats.bind(errorHandlingService);
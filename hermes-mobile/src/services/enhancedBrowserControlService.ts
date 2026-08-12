/**
 * Enhanced browser control service for Hermes Mobile.
 * Provides integration with external tools like GitHub, Linear, and Obsidian.
 */

import { 
  isEnhancedBrowserControlTool, 
  generateBrowserApprovalPrompt,
  validateBrowserToolParams,
  assessBrowserToolRisk,
  getBrowserToolByName
} from '../utils/enhancedBrowserControlTools';

// Integration configurations for external tools
const EXTERNAL_TOOL_CONFIGS = {
  github: {
    name: 'GitHub',
    baseUrl: 'https://github.com',
    selectors: {
      login: '#login_field, [data-testid="username"]',
      password: '#password, [data-testid="password"]',
      search: '[data-testid="header-search-input"], #header-search-input',
      repoList: '[data-testid="your-repositories"]',
      issueList: '[data-testid="issue-list"]',
      pullRequestList: '[data-testid="pull-request-list"]',
    },
    capabilities: ['auth', 'browse', 'search', 'create-issue', 'create-pr']
  },
  linear: {
    name: 'Linear',
    baseUrl: 'https://linear.app',
    selectors: {
      login: '[data-testid="email-input"], #email',
      password: '[data-testid="password-input"], #password',
      search: '[data-testid="global-search"], [aria-label="Search"]',
      issueList: '[data-testid="issue-list"]',
      projectBoard: '[data-testid="project-board"]',
      cycleView: '[data-testid="cycle-view"]',
    },
    capabilities: ['auth', 'browse', 'search', 'create-issue', 'update-issue', 'view-projects']
  },
  obsidian: {
    name: 'Obsidian',
    baseUrl: 'https://obsidian.md',
    selectors: {
      vaultSelector: '[data-testid="vault-selector"]',
      noteList: '[data-testid="file-explorer"]',
      search: '[data-testid="search-input"]',
      canvas: '[data-testid="canvas"]',
      graph: '[data-testid="graph"]',
    },
    capabilities: ['browse-notes', 'search-notes', 'create-note', 'update-note', 'view-graph']
  }
};

// Enhanced browser automation functions
export class EnhancedBrowserControlService {
  private activeTabId: string | null = null;
  private lastActionResult: any = null;

  /**
   * Execute an enhanced browser control action
   */
  async executeBrowserAction(
    toolName: string, 
    params: Record<string, any>
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    // Validate the tool and parameters
    const validation = validateBrowserToolParams(toolName, params);
    if (!validation.isValid) {
      return {
        success: false,
        error: `Invalid parameters: ${validation.errors.join(', ')}`
      };
    }

    try {
      // Route to appropriate handler based on tool name
      switch (toolName) {
        case 'browser_navigate':
          return await this.navigateTo(params.url, params.newTab);
          
        case 'browser_click':
          return await this.clickElement(params.selector, params.strategy);
          
        case 'browser_type':
          return await this.typeText(params.selector, params.text, params.clearFirst);
          
        case 'browser_fill':
          return await this.fillForm(params.selector, params.data);
          
        case 'browser_snapshot':
          return await this.captureSnapshot(params.selector, params.fullPage);
          
        case 'browser_screenshot':
          return await this.takeScreenshot(params.selector, params.fullPage, params.format);
          
        case 'browser_cdp':
          return await this.executeCDPCommand(params.command, params.params);
          
        case 'browser_select':
          return await this.selectOption(params.selector, params.option, params.byValue);
          
        case 'browser_tab':
          return await this.manageTab(params.action, params.target);
          
        case 'browser_wait':
          return await this.waitForCondition(params.condition, params.selector, params.timeout);
          
        case 'browser_scroll':
          return await this.scrollPage(params.direction, params.selector, params.position);
          
        case 'browser_hover':
          return await this.hoverOver(params.selector, params.duration);
          
        case 'browser_press':
          return await this.pressKey(params.key, params.modifier, params.text);
          
        case 'computer_use':
          return await this.executeComputerUse(params.action, params.target);
          
        case 'computer_use_click':
          return await this.computerUseClick(params.x, params.y, params.button, params.element);
          
        case 'computer_use_type':
          return await this.computerUseType(params.text, params.delay);
          
        default:
          return {
            success: false,
            error: `Unsupported browser tool: ${toolName}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Browser action failed: ${error.message || error}`
      };
    }
  }

  /**
   * Navigate to a URL with enhanced options
   */
  async navigateTo(url: string, newTab: boolean = false): Promise<any> {
    // Implementation would connect to the actual browser automation
    // For now, returning a mock response
    return {
      success: true,
      result: {
        url,
        newTab,
        status: 'navigated',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Click an element with multiple selector strategies
   */
  async clickElement(selector: string, strategy: string = 'css'): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        strategy,
        status: 'clicked',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Type text into an element
   */
  async typeText(selector: string, text: string, clearFirst: boolean = true): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        text: clearFirst ? '[REDACTED]' : text, // Don't expose sensitive text in results
        clearFirst,
        status: 'typed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Fill a form with data
   */
  async fillForm(selector: string, data: Record<string, any>): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        data: this.redactSensitiveData(data), // Don't expose sensitive data in results
        status: 'filled',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Capture a snapshot of page content
   */
  async captureSnapshot(selector?: string, fullPage: boolean = false): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        fullPage,
        content: '[SNAPSHOT CONTENT]',
        status: 'captured',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Take a screenshot
   */
  async takeScreenshot(selector?: string, fullPage: boolean = false, format: string = 'png'): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        fullPage,
        format,
        screenshot: '[SCREENSHOT DATA]',
        status: 'screenshot taken',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute a Chrome DevTools Protocol command
   */
  async executeCDPCommand(command: string, params: any): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        command,
        params: this.redactSensitiveData(params),
        status: 'executed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector: string, option: string, byValue: boolean = false): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        option,
        byValue,
        status: 'selected',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Manage browser tabs
   */
  async manageTab(action: string, target?: string): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        action,
        target,
        status: 'tab managed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Wait for a condition
   */
  async waitForCondition(condition: string, selector?: string, timeout: number = 10000): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        condition,
        selector,
        timeout,
        status: 'waited',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Scroll the page or an element
   */
  async scrollPage(direction: string, selector?: string, position?: number): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        direction,
        selector,
        position,
        status: 'scrolled',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Hover over an element
   */
  async hoverOver(selector: string, duration: number = 0): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        selector,
        duration,
        status: 'hovered',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Press a key or key combination
   */
  async pressKey(key: string, modifier?: string, text?: string): Promise<any> {
    // Implementation would connect to the actual browser automation
    return {
      success: true,
      result: {
        key,
        modifier,
        text: text ? '[REDACTED]' : undefined, // Don't expose sensitive text
        status: 'pressed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute computer use action
   */
  async executeComputerUse(action: string, target?: any): Promise<any> {
    // Implementation would connect to the actual computer automation
    return {
      success: true,
      result: {
        action,
        target: this.redactSensitiveData(target),
        status: 'executed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Computer use click
   */
  async computerUseClick(x?: number, y?: number, button: string = 'left', element?: any): Promise<any> {
    // Implementation would connect to the actual computer automation
    return {
      success: true,
      result: {
        x,
        y,
        button,
        element: element ? '[ELEMENT]' : undefined,
        status: 'clicked',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Computer use type
   */
  async computerUseType(text: string, delay: number = 0): Promise<any> {
    // Implementation would connect to the actual computer automation
    return {
      success: true,
      result: {
        text: '[REDACTED]', // Don't expose sensitive text
        delay,
        status: 'typed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute GitHub-specific action
   */
  async executeGitHubAction(action: string, params: Record<string, any>): Promise<any> {
    const githubConfig = EXTERNAL_TOOL_CONFIGS.github;
    
    // Implementation would connect to the actual GitHub automation
    return {
      success: true,
      result: {
        tool: 'GitHub',
        action,
        params: this.redactSensitiveData(params),
        baseUrl: githubConfig.baseUrl,
        status: 'executed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute Linear-specific action
   */
  async executeLinearAction(action: string, params: Record<string, any>): Promise<any> {
    const linearConfig = EXTERNAL_TOOL_CONFIGS.linear;
    
    // Implementation would connect to the actual Linear automation
    return {
      success: true,
      result: {
        tool: 'Linear',
        action,
        params: this.redactSensitiveData(params),
        baseUrl: linearConfig.baseUrl,
        status: 'executed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Execute Obsidian-specific action
   */
  async executeObsidianAction(action: string, params: Record<string, any>): Promise<any> {
    const obsidianConfig = EXTERNAL_TOOL_CONFIGS.obsidian;
    
    // Implementation would connect to the actual Obsidian automation
    return {
      success: true,
      result: {
        tool: 'Obsidian',
        action,
        params: this.redactSensitiveData(params),
        baseUrl: obsidianConfig.baseUrl,
        status: 'executed',
        timestamp: Date.now()
      }
    };
  }

  /**
   * Get the current active tab ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * Get the last action result
   */
  getLastActionResult(): any {
    return this.lastActionResult;
  }

  /**
   * Redact sensitive data from objects
   */
  private redactSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    // If it's an array, process each element
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactSensitiveData(item));
    }

    // If it's an object, check each property
    const redactedObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (this.isSensitiveField(key)) {
        redactedObj[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redactedObj[key] = this.redactSensitiveData(value);
      } else {
        redactedObj[key] = value;
      }
    }

    return redactedObj;
  }

  /**
   * Check if a field name is considered sensitive
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /token/i,
      /key/i,
      /credential/i,
      /auth/i,
      /api/i,
      /session/i,
      /cookie/i
    ];

    return sensitivePatterns.some(pattern => pattern.test(fieldName));
  }
}

// Singleton instance of the enhanced browser control service
export const enhancedBrowserControlService = new EnhancedBrowserControlService();

// Export convenience functions for common operations
export const executeBrowserAction = enhancedBrowserControlService.executeBrowserAction.bind(enhancedBrowserControlService);
export const executeGitHubAction = enhancedBrowserControlService.executeGitHubAction.bind(enhancedBrowserControlService);
export const executeLinearAction = enhancedBrowserControlService.executeLinearAction.bind(enhancedBrowserControlService);
export const executeObsidianAction = enhancedBrowserControlService.executeObsidianAction.bind(enhancedBrowserControlService);
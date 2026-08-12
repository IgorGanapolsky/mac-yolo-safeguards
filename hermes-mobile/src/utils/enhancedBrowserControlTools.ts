/**
 * Enhanced browser control tools for Hermes Mobile.
 * Provides advanced browser automation capabilities with better error handling and feedback.
 */

// Browser control tool definitions with enhanced capabilities
const ENHANCED_BROWSER_TOOLS = {
  // Navigation tools
  browser_navigate: {
    name: 'browser_navigate',
    label: 'Browser Navigation',
    description: 'Navigate to URLs with enhanced options',
    capabilities: ['url', 'newTab', 'waitForLoad'],
    riskLevel: 'medium'
  },
  browser_back: {
    name: 'browser_back',
    label: 'Browser Back',
    description: 'Navigate back in browser history',
    capabilities: ['steps', 'waitForLoad'],
    riskLevel: 'low'
  },
  browser_forward: {
    name: 'browser_forward',
    label: 'Browser Forward',
    description: 'Navigate forward in browser history',
    capabilities: ['steps', 'waitForLoad'],
    riskLevel: 'low'
  },
  browser_refresh: {
    name: 'browser_refresh',
    label: 'Browser Refresh',
    description: 'Refresh the current page',
    capabilities: ['hardRefresh', 'waitForLoad'],
    riskLevel: 'low'
  },

  // Interaction tools
  browser_click: {
    name: 'browser_click',
    label: 'Browser Click',
    description: 'Click elements with selector strategies',
    capabilities: ['selector', 'strategy', 'waitForNav'],
    riskLevel: 'medium'
  },
  browser_type: {
    name: 'browser_type',
    label: 'Browser Type',
    description: 'Type text into elements',
    capabilities: ['selector', 'text', 'clearFirst'],
    riskLevel: 'medium'
  },
  browser_fill: {
    name: 'browser_fill',
    label: 'Browser Fill',
    description: 'Fill forms and input fields',
    capabilities: ['selector', 'data', 'strategy'],
    riskLevel: 'medium'
  },
  browser_select: {
    name: 'browser_select',
    label: 'Browser Select',
    description: 'Select options from dropdowns',
    capabilities: ['selector', 'option', 'byValue'],
    riskLevel: 'medium'
  },

  // Content tools
  browser_snapshot: {
    name: 'browser_snapshot',
    label: 'Browser Snapshot',
    description: 'Capture page content and structure',
    capabilities: ['selector', 'fullPage', 'metadata'],
    riskLevel: 'low'
  },
  browser_screenshot: {
    name: 'browser_screenshot',
    label: 'Browser Screenshot',
    description: 'Take visual screenshots of pages',
    capabilities: ['selector', 'fullPage', 'format'],
    riskLevel: 'low'
  },
  browser_console: {
    name: 'browser_console',
    label: 'Browser Console',
    description: 'Access browser console logs',
    capabilities: ['filter', 'level', 'capture'],
    riskLevel: 'low'
  },

  // Advanced tools
  browser_cdp: {
    name: 'browser_cdp',
    label: 'Browser CDP',
    description: 'Direct Chrome DevTools Protocol commands',
    capabilities: ['command', 'params', 'evaluate'],
    riskLevel: 'high'
  },
  browser_tab: {
    name: 'browser_tab',
    label: 'Browser Tab',
    description: 'Manage browser tabs and windows',
    capabilities: ['action', 'target', 'switch'],
    riskLevel: 'medium'
  },
  browser_wait: {
    name: 'browser_wait',
    label: 'Browser Wait',
    description: 'Wait for conditions with timeouts',
    capabilities: ['condition', 'selector', 'timeout'],
    riskLevel: 'low'
  },
  browser_scroll: {
    name: 'browser_scroll',
    label: 'Browser Scroll',
    description: 'Scroll page or elements',
    capabilities: ['direction', 'selector', 'position'],
    riskLevel: 'low'
  },
  browser_hover: {
    name: 'browser_hover',
    label: 'Browser Hover',
    description: 'Hover over elements',
    capabilities: ['selector', 'duration'],
    riskLevel: 'low'
  },
  browser_press: {
    name: 'browser_press',
    label: 'Browser Press',
    description: 'Press keyboard keys',
    capabilities: ['key', 'modifier', 'text'],
    riskLevel: 'medium'
  },

  // Computer use tools
  computer_use: {
    name: 'computer_use',
    label: 'Computer Use',
    description: 'General computer automation',
    capabilities: ['action', 'target', 'coordinates'],
    riskLevel: 'high'
  },
  computer_use_click: {
    name: 'computer_use_click',
    label: 'Computer Click',
    description: 'Click at coordinates or elements',
    capabilities: ['x', 'y', 'button', 'element'],
    riskLevel: 'high'
  },
  computer_use_type: {
    name: 'computer_use_type',
    label: 'Computer Type',
    description: 'Type text using computer automation',
    capabilities: ['text', 'delay'],
    riskLevel: 'high'
  }
};

// Selector strategies for element identification
const SELECTOR_STRATEGIES = {
  css: 'CSS selector (e.g., #id, .class, tag)',
  xpath: 'XPath expression',
  text: 'Visible text content',
  accessibility: 'Accessibility ID/label',
  dataTestId: 'Data test ID attribute',
  tagName: 'HTML tag name',
  className: 'CSS class name',
  attribute: 'Custom attribute value'
};

// Enhanced browser control utilities
export function getEnhancedBrowserTools() {
  return Object.values(ENHANCED_BROWSER_TOOLS);
}

export function getBrowserToolByName(name: string) {
  return ENHANCED_BROWSER_TOOLS[name as keyof typeof ENHANCED_BROWSER_TOOLS] || null;
}

export function getSelectorStrategies() {
  return SELECTOR_STRATEGIES;
}

// Risk assessment with more granular levels
export function assessBrowserToolRisk(toolName: string, params: Record<string, any> = {}): 'low' | 'medium' | 'high' {
  const tool = getBrowserToolByName(toolName);
  if (!tool) {
    return 'medium'; // Default to medium for unknown tools
  }

  // Override based on specific parameters
  if (toolName === 'browser_cdp' && params.command) {
    // Certain CDP commands are higher risk
    const highRiskCommands = ['Runtime.evaluate', 'Page.navigate', 'DOM.setFileInputFiles'];
    if (highRiskCommands.includes(params.command)) {
      return 'high';
    }
  }

  if (toolName === 'computer_use' || toolName.startsWith('computer_use_')) {
    return 'high'; // Computer use tools are generally high risk
  }

  return tool.riskLevel as 'low' | 'medium' | 'high';
}

// Format enhanced tool labels for UI display
export function formatEnhancedBrowserToolLabel(toolName: string): string {
  const tool = getBrowserToolByName(toolName);
  if (tool) {
    return tool.label;
  }
  
  // Fallback for dynamic or unknown tool names
  const formatted = toolName
    .replace(/^browser[_.]/i, '')
    .replace(/^computer[_.-]?use[_.]?/i, '')
    .replace(/_/g, ' ')
    .trim();
    
  return formatted ? `Browser · ${formatted}` : 'Browser Control';
}

// Generate enhanced approval prompts for browser actions
export function generateBrowserApprovalPrompt(toolName: string, params: Record<string, any> = {}): string {
  const tool = getBrowserToolByName(toolName);
  if (!tool) {
    return `Allow browser action: ${toolName}?`;
  }

  switch (toolName) {
    case 'browser_navigate':
      return `Navigate browser to: ${params.url || '[URL not specified]'}`;
      
    case 'browser_click':
      const selector = params.selector || '[selector not specified]';
      const strategy = params.strategy || 'css';
      return `Click element: ${strategy}="${selector}"`;
      
    case 'browser_type':
      return `Type text into field: ${params.selector || '[field not specified]'}`;
      
    case 'browser_fill':
      return `Fill form with data: ${Object.keys(params.data || {}).join(', ')}`;
      
    case 'browser_cdp':
      return `Execute Chrome DevTools command: ${params.command || '[command not specified]'}`;
      
    case 'computer_use':
    case 'computer_use_click':
    case 'computer_use_type':
      return `Control computer desktop interface (high risk): ${tool.label}`;
      
    default:
      return `Allow browser action: ${tool.label}?`;
  }
}

// Validate browser tool parameters
export function validateBrowserToolParams(toolName: string, params: Record<string, any>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!toolName) {
    errors.push('Tool name is required');
    return { isValid: false, errors };
  }
  
  const tool = getBrowserToolByName(toolName);
  if (!tool) {
    errors.push(`Unknown browser tool: ${toolName}`);
    return { isValid: false, errors };
  }
  
  // Validate specific parameters based on tool
  switch (toolName) {
    case 'browser_navigate':
      if (!params.url || typeof params.url !== 'string') {
        errors.push('URL is required for browser navigation');
      } else if (!params.url.startsWith('http://') && !params.url.startsWith('https://')) {
        errors.push('URL must be a valid HTTP(S) address');
      }
      break;
      
    case 'browser_click':
    case 'browser_type':
    case 'browser_fill':
    case 'browser_select':
    case 'browser_snapshot':
    case 'browser_screenshot':
      if (!params.selector) {
        errors.push('Selector is required for element targeting');
      }
      break;
      
    case 'browser_cdp':
      if (!params.command) {
        errors.push('CDP command is required');
      }
      break;
  }
  
  return { isValid: errors.length === 0, errors };
}

// Helper to detect if a tool is browser-related
export function isEnhancedBrowserControlTool(toolName?: string | null): boolean {
  if (!toolName) return false;
  
  const normalized = toolName.trim().toLowerCase();
  if (!normalized) return false;
  
  // Check against known browser tools
  if (normalized in ENHANCED_BROWSER_TOOLS) {
    return true;
  }
  
  // Check for common prefixes
  const prefixes = ['browser_', 'browser.', 'computer_use', 'computer-use'];
  return prefixes.some(prefix => normalized.startsWith(prefix));
}

// Get available actions for a specific browser tool
export function getBrowserToolActions(toolName: string): string[] {
  const tool = getBrowserToolByName(toolName);
  if (!tool) return [];
  
  // Return capabilities as actionable items
  return tool.capabilities || [];
}

// Format parameters for display in UI
export function formatBrowserToolParams(toolName: string, params: Record<string, any>): string {
  if (!params || typeof params !== 'object') {
    return '';
  }
  
  const paramEntries = Object.entries(params)
    .filter(([key, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      if (key === 'data' && typeof value === 'object') {
        // Format object data specially
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${String(value)}`;
    });
  
  return paramEntries.join(', ');
}
// WebMCP Bridge for ThumbGate Dashboard
// Registers browser-native AI tools that agents can discover and execute
// Must be loaded after the dashboard DOM is ready

import { validateWebMCPTool, registerWebMCPTool } from './webmcp-kit.js';

// Dashboard API endpoints (relative to dashboard origin)
const DASHBOARD_API = {
  getCost: '/api/billing/inference-cost',
  auditMCP: '/api/mcp/audit',
  listTools: '/api/tools',
  registerTool: '/api/tools'
};

// Tool: Get today's inference cost
const costTool = {
  name: 'get_inference_cost_today',
  title: 'Get Inference Cost Today',
  description: 'Returns today\'s inference cost summary from the ThumbGate dashboard.',
  inputSchema: {
    type: 'object',
    properties: {
      serviceFilter: {
        type: 'string',
        description: 'Optional service name to filter (hermes, grok, claude, etc.)'
      }
    }
  },
  risk: 'read',
  execute: async (args, context) => {
    const url = new URL(DASHBOARD_API.getCost, window.location.origin);
    if (args.serviceFilter) url.searchParams.set('service', args.serviceFilter);
    
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
    if (!response.ok) {
      return JSON.stringify({ ok: false, error: `HTTP ${response.status}` });
    }
    const data = await response.json();
    return JSON.stringify({ ok: true, data });
  }
};

// Tool: Audit MCP connection
const auditTool = {
  name: 'audit_mcp_connection',
  title: 'Audit MCP Connection',
  description: 'Verifies the ThumbGate MCP connection status for a given service.',
  risk: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      service: {
        type: 'string',
        description: 'Service name: hermes, grok, claude, etc.'
      }
    },
    required: ['service']
  },
  execute: async (args, context) => {
    const url = DASHBOARD_API.auditMCP + `?service=${encodeURIComponent(args.service)}`;
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
    const data = await response.json();
    return JSON.stringify({ ok: response.ok, data });
  }
};

// Tool: Register dashboard tool
const registerTool = {
  name: 'register_dashboard_tool',
  title: 'Register Dashboard Tool',
  description: 'Registers a new browser tool in the ThumbGate dashboard. Requires user confirmation.',
  risk: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      toolName: { type: 'string', description: 'Name of the tool to register' },
      description: { type: 'string', description: 'Tool description for agents' },
      endpoint: { type: 'string', description: 'API endpoint for the tool' }
    },
    required: ['toolName', 'description', 'endpoint']
  },
  confirm: async (info) => {
    // Show confirmation dialog
    const confirmed = confirm(`Register new dashboard tool?\n\nName: ${info.args.toolName}\nDescription: ${info.args.description}\nEndpoint: ${info.args.endpoint}`);
    return confirmed;
  },
  execute: async (args, context) => {
    const response = await fetch(DASHBOARD_API.registerTool, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        name: args.toolName,
        description: args.description,
        endpoint: args.endpoint
      })
    });
    const data = await response.json();
    return JSON.stringify({ ok: response.ok, data });
  }
};

// Tool: List registered tools
const listTools = {
  name: 'list_registered_tools',
  title: 'List Registered Tools',
  description: 'Lists all tools currently registered in the ThumbGate dashboard.',
  risk: 'read',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Optional category to filter (billing, management, diagnostics)'
      }
    }
  },
  execute: async (args, context) => {
    const url = new URL(DASHBOARD_API.listTools, window.location.origin);
    if (args.category) url.searchParams.set('category', args.category);
    
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin' });
    const data = await response.json();
    return JSON.stringify({ ok: response.ok, tools: data });
  }
};

// Register all tools with WebMCP
export async function registerDashboardTools() {
  const tools = [costTool, auditTool, registerTool, listTools];
  const results = [];
  
  for (const tool of tools) {
    try {
      validateWebMCPTool(tool);
      if (globalThis.document?.modelContext) {
        await globalThis.document.modelContext.registerTool({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations || {},
          risk: tool.risk,
          confirm: tool.risk !== 'read' ? tool.confirm : undefined,
          execute: tool.execute
        });
        results.push({ name: tool.name, registered: true });
      } else {
        results.push({ name: tool.name, registered: false, reason: 'document.modelContext unavailable' });
      }
    } catch (e) {
      results.push({ name: tool.name, registered: false, error: e.message });
    }
  }
  
  return results;
}

// Auto-register when module loads (with feature detection)
if (typeof window !== 'undefined' && document.readyState === 'complete') {
  registerDashboardTools().catch(console.error);
} else if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    registerDashboardTools().catch(console.error);
  });
}
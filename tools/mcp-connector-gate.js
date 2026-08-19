#!/usr/bin/env node
'use strict';

/**
 * MCP Connector Governance Gate
 *
 * High-ROI synthesis of The NewStack article "Mistral MCP Connector Migration"
 * (thenewstack.io/mistral-mcp-connector-migration), addressing:
 *
 *   1. Who operates the MCP server? (identity verification)
 *   2. Where does data go? (data residency / caching)
 *   3. Are permissions enforced? (auth + access control)
 *   4. Prompt injection risk in server responses
 *
 * The article notes that MCP "shifts retrieval off-platform" and that
 * "the behavior of a given connector depends entirely on its operator."
 * Enterprises need governance guardrails before trusting external MCP servers.
 *
 * This tool:
 *   - Loads MCP server configurations (claude_desktop_config.json or
 *     mcp-needs-auth-cache.json fallback)
 *   - Assesses each server's governance risk (operator identity, TLS, auth,
 *     data residency, permission enforcement, deprecation/caching risk)
 *   - Scans text (MCP server responses) for prompt injection patterns
 *   - Provides CLI: scan / check / inject-scan / health
 *
 * Dependency-free: Node.js built-ins only (fs, path, os, https, url).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// Configuration & Constants
// ---------------------------------------------------------------------------

const DEFAULT_HOME_CONFIG = path.join(os.homedir(), '.claude', 'claude_desktop_config.json');
const DEFAULT_AUTH_CACHE = path.join(os.homedir(), '.claude', 'mcp-needs-auth-cache.json');

/**
 * First-party MCP server operators (low risk trust tier).
 * These are servers where the operator is the platform vendor itself.
 */
const FIRST_PARTY_OPERATORS = new Set([
  'claude.ai',
  'anthropic.com',
  'anthropic',
]);

/**
 * Known verified third-party MCP server operators (medium trust tier).
 * These have published security/privacy documentation.
 */
const VERIFIED_THIRD_PARTY_OPERATORS = new Set([
  'openrouter.ai',
  'openrouter',
  'figma.com',
  'figma',
  'atlassian.com',
  'atlassian',
  'semrush.com',
  'semrush',
  'apollo.io',
  'apollo',
  'higgsfield',
]);

/**
 * Deprecated / migrated connectors (per the NewStack article, Mistral is
 * replacing Google Drive and SharePoint connectors).
 */
const DEPRECATED_CONNECTORS = new Set([
  'google-drive',
  'googledrive',
  'sharepoint',
  'microsoft-sharepoint',
  'm365-sharepoint',
]);

/**
 * Prompt injection patterns — indicators that text may contain injected
 * instructions designed to manipulate an AI agent.
 * Based on the article's note: "Mistral recommends checking server output
 * for signs of prompt injection."
 */
const INJECTION_PATTERNS = [
  {
    id: 'instruction_override',
    name: 'Instruction override',
    re: /\b(?:ignore (?:all )?previous (?:instructions?|prompts?|rules?|guidelines?)|you are (?:now|no longer)|disregard (?:all )?(?:previous|prior|above) (?:instructions?|prompts?|rules?|guidelines?)|forget (?:everything|all|your|previous)|new (?:system|developer|root) (?:prompt|instructions?|message)|override (?:your|the|all) (?:instructions?|rules?)|system-prompt|developer-prompt|ignore prior|ignore your|ignore all)/gi,
    severity: 'high',
  },
  {
    id: 'identity_manipulation',
    name: 'Identity/role manipulation',
    re: /\b(?:you are (?:ChatGPT|Claude|Gemini|Bard|Copilot|Assistant|now)|you are now|you are a different|act as (?:a |an )?(?:different|new)|pretend to be|you should now behave as|your new role is|your role has changed)/gi,
    severity: 'high',
  },
  {
    id: 'command_injection',
    name: 'Command injection attempt',
    re: /\b(?:execute|run|call|invoke)\s+(?:shell|bash|cmd|terminal|system|sudo|eval|exec)\b/gi,
    severity: 'high',
  },
  {
    id: 'malicious_url_redirect',
    name: 'URL exfiltration / redirect attempt',
    re: /(?:click here|visit this|go to|redirect to|send to|forward to|submit to)\s+(?:http|https|file|javascript):/gi,
    severity: 'medium',
  },
  {
    id: 'credential_stealing',
    name: 'Credential/API key exfiltration attempt',
    re: /\b(?:(?:api[\s_-]?key|secret|password|token|credential|auth)\s*(?:steal|exfil|leak|expose|extract|capture)|(?:steal|exfil|leak|expose|extract|capture)\s*(?:api[\s_-]?key|secret|password|token|credential|auth))\b/gi,
    severity: 'high',
  },
  {
    id: 'file_system_escape',
    name: 'File system escape attempt',
    re: /\b(?:read|write|delete|modify)\s+(?:~\/\.ssh|~\/\.aws|~\/\.env|\/etc\/passwd|\/etc\/shadow|\.bashrc|\.zshrc)/gi,
    severity: 'high',
  },
  {
    id: 'environment_manipulation',
    name: 'Hidden instruction via encoding',
    re: /<script[^>]*>.*?<\/script>|\bbase64\s+--decode|eval\s*\(|atob\s*\(|String\.fromCharCode/gi,
    severity: 'medium',
  },
];

/**
 * Risk levels for MCP connectors.
 */
const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ---------------------------------------------------------------------------
// MCP Server Configuration Loading
// ---------------------------------------------------------------------------

/**
 * Load MCP server configurations from disk.
 * Tries claude_desktop_config.json first, falls back to mcp-needs-auth-cache.json.
 *
 * @param {Object} opts - Options: { configPath, authCachePath }
 * @returns {Object} { servers: Array, sources: Array, warnings: Array }
 */
function loadMcpServers(opts) {
  opts = opts || {};
  const configPath = opts.configPath || DEFAULT_HOME_CONFIG;
  const authCachePath = opts.authCachePath || DEFAULT_AUTH_CACHE;
  const servers = [];
  const sources = [];
  const warnings = [];

  // Try claude_desktop_config.json first (primary source)
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      const mcpServers = config.mcpServers || {};
      for (const [name, cfg] of Object.entries(mcpServers)) {
        servers.push(normalizeServerConfig(name, cfg, 'claude_desktop_config.json'));
      }
      sources.push(configPath);
    } catch (e) {
      warnings.push(`Failed to parse ${configPath}: ${e.message}`);
    }
  } else {
    warnings.push(`Config not found: ${configPath}`);
  }

  // Fall back to / supplement with mcp-needs-auth-cache.json
  if (fs.existsSync(authCachePath)) {
    try {
      const raw = fs.readFileSync(authCachePath, 'utf8');
      const cache = JSON.parse(raw);
      if (typeof cache === 'object' && cache !== null) {
        for (const [name, entry] of Object.entries(cache)) {
          if (!servers.find((s) => s.name === name)) {
            // Entry may be { timestamp, id } — extract what we can
            const src = cache[name] ? cache[name].source : null;
            servers.push({
              name,
              url: null,
              transport: src || null,
              authRequired: entry && entry.id ? true : false,
              authType: entry && entry.id ? 'oauth' : 'unknown',
              source: authCachePath,
              fromCache: true,
            });
          }
        }
        sources.push(authCachePath);
      }
    } catch (e) {
      warnings.push(`Failed to parse ${authCachePath}: ${e.message}`);
    }
  }

  // If we have no servers from either source, add a synthetic "none" entry
  if (servers.length === 0) {
    servers.push({
      name: '(none)',
      url: null,
      transport: null,
      authRequired: false,
      authType: 'none',
      source: null,
      fromCache: false,
    });
  }

  return { servers, sources, warnings };
}

/**
 * Normalize a server config entry from claude_desktop_config.json.
 *
 * @param {string} name - Server name
 * @param {Object|string} cfg - Server configuration (object or URL string)
 * @param {string} source - Source file path
 * @returns {Object} Normalized server object
 */
function normalizeServerConfig(name, cfg, source) {
  // Claude Desktop config can have: { type: 'http', url: 'http://...' }
  // or { type: 'sse', url: 'http://...' }
  // or { command: 'node', args: [...], ... } (stdio)
  const result = { name, url: null, transport: null, authRequired: false, authType: 'none', source, command: null, args: null };

  if (typeof cfg === 'string') {
    result.url = cfg;
    result.transport = 'http';
  } else if (cfg) {
    if (cfg.url) {
      result.url = cfg.url;
      result.transport = cfg.type || (cfg.url.startsWith('http') ? 'sse' : 'stdio');
    }
    if (cfg.command) {
      result.command = cfg.command;
      result.args = cfg.args || [];
      result.transport = cfg.type || 'stdio';
    }
    if (cfg.env && cfg.env.MCP_AUTH_TOKEN) result.authType = 'token';
    if (cfg.headers && cfg.headers.Authorization) result.authType = 'bearer';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Server Risk Assessment
// ---------------------------------------------------------------------------

/**
 * Assess the governance risk of a single MCP server.
 *
 * Risk dimensions (per NewStack article):
 *   - operator: Who runs the server? (first-party, verified third-party, unknown)
 *   - tls: Is the connection encrypted? (https / sse-over-https vs http)
 *   - auth: Is authentication required? (oauth, token, bearer, none, unknown)
 *   - residency: Where is data processed/stored? (eu, us, unknown)
 *   - deprecated: Is this connector known-deprecated (Google Drive, SharePoint)?
 *   - promptInjectionGuard: Does the server implement output scanning?
 *
 * @param {Object} server - Normalized server object from loadMcpServers()
 * @param {Object} opts - Options: { trustedDomains, euDomains }
 * @returns {Object} Risk assessment with { risk, score, dimensions, findings, recommendation }
 */
function assessServerRisk(server, opts) {
  opts = opts || {};
  const trustedDomains = opts.trustedDomains || VERIFIED_THIRD_PARTY_OPERATORS;
  const euDomains = opts.euDomains || new Set(['mistral.ai', 'eu.', '.eu', 'ovhcloud.com', 'IONOS', 'Scaleway']);
  const firstParty = opts.firstParty || FIRST_PARTY_OPERATORS;

  const dimensions = {};
  const findings = [];
  let score = 0;

  // --- Operator identity ---
  let operator = 'unknown';
  let operatorName = extractOperator(server);
  if (operatorName && firstParty.has(operatorName)) {
    operator = 'first-party';
  } else if (operatorName && trustedDomains.has(operatorName)) {
    operator = 'verified-third-party';
  } else if (operatorName && operatorName === 'third-party') {
    operator = 'third-party';
  } else {
    operator = 'unknown';
    findings.push({ severity: 'medium', message: `Unknown MCP server operator: ${server.name}` });
  }

  dimensions.operator = { level: operator, name: operatorName, score: operator === 'first-party' ? 0 : operator === 'verified-third-party' ? 2 : operator === 'third-party' ? 3 : 5 };
  score += dimensions.operator.score;

  // --- Deprecation check (per article: Google Drive / SharePoint migration) ---
  const isDeprecated = isDeprecatedConnector(server.name);
  dimensions.deprecated = { deprecated: isDeprecated, deadline: null, score: isDeprecated ? 5 : 0 };
  if (isDeprecated) {
    findings.push({
      severity: 'critical',
      message: `Connector "${server.name}" is deprecated and will be shut down. No automatic migration available — install MCP replacement before reconnect.`,
    });
    score += 5;
  }

  // --- TLS / encryption ---
  let tlsOk = false;
  if (server.url) {
    try {
      const parsed = new URL(server.url);
      tlsOk = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
    } catch (e) {
      tlsOk = false;
    }
  } else if (server.transport === 'stdio' || server.transport === null) {
    // stdio transport is local — no network risk
    tlsOk = true;
  }

  dimensions.tls = { encrypted: tlsOk, score: tlsOk ? 0 : 5 };
  if (!tlsOk && server.url) {
    findings.push({
      severity: 'high',
      message: `MCP server URL uses unencrypted transport: ${server.url}`,
    });
    score += 5;
  }

  // --- Auth ---
  const authOk = server.authType !== 'none' && server.authType !== 'unknown';
  const authType = server.authType || 'unknown';
  dimensions.auth = { required: authOk, type: authType, score: authOk ? 0 : (server.transport === 'stdio' ? 0 : 3) };
  if (!authOk && server.transport !== 'stdio') {
    findings.push({
      severity: 'high',
      message: `No authentication required for remote MCP server: ${server.name}`,
    });
    score += 3;
  }

  // --- Data residency ---
  let residency = 'unknown';
  if (server.url) {
    try {
      const parsed = new URL(server.url);
      for (const domain of euDomains) {
        if (parsed.hostname.includes(domain) || parsed.hostname.endsWith(domain.replace(/\./g, ''))) {
          residency = 'eu';
          break;
        }
      }
      if (residency === 'unknown' && parsed.hostname.includes('googleapis.com')) {
        residency = 'us';
      }
      if (residency === 'unknown' && (parsed.hostname.includes('sharepoint.') || parsed.hostname.includes('microsoft.'))) {
        residency = 'us';
      }
    } catch (e) {
      // continue
    }
  } else {
    residency = 'local';
  }

  dimensions.residency = { location: residency, score: residency === 'unknown' ? 1 : 0 };
  if (residency === 'unknown' && server.url) {
    findings.push({
      severity: 'low',
      message: `Data residency unknown for MCP server: ${server.name} (${server.url})`,
    });
    score += 1;
  }

  // --- Prompt injection guard (per article: "checking server output for signs of prompt injection") ---
  // We assume no server has this built-in unless explicitly configured.
  // This is a known gap from the article — flagged as low since it's an
  // emerging concern, not an immediate vulnerability.
  dimensions.promptInjectionGuard = { enabled: false, score: 1 };
  findings.push({
    severity: 'low',
    message: `No prompt injection scanning configured for MCP server: ${server.name}. Article notes this as an emerging risk.`,
  });
  score += 1;

  // --- Caching / data retention ---
  // Article: "Any caching remains unexplained"
  dimensions.caching = { documented: false, score: 1 };
  findings.push({
    severity: 'low',
    message: `Caching/deletion policy undocumented for MCP server: ${server.name}.`,
  });
  score += 1;

  // --- Compile risk level ---
  let risk;
  if (score >= 10) risk = RISK_LEVELS.CRITICAL;
  else if (score >= 6) risk = RISK_LEVELS.HIGH;
  else if (score >= 3) risk = RISK_LEVELS.MEDIUM;
  else risk = RISK_LEVELS.LOW;

  return {
    name: server.name,
    url: server.url,
    transport: server.transport,
    authType: authType,
    risk,
    score,
    dimensions,
    findings,
    recommendation: generateRecommendation(risk, findings, server),
  };
}

/**
 * Extract the operator identifier from a server config.
 * @param {Object} server - Normalized server object
 * @returns {string|null}
 */
function extractOperator(server) {
  // Check URL hostname
  if (server.url) {
    try {
      const parsed = new URL(server.url);
      const hostname = parsed.hostname;
      for (const domain of FIRST_PARTY_OPERATORS) {
        if (hostname.includes(domain) || hostname.endsWith(domain.replace(/\./g, ''))) return domain;
      }
      for (const domain of VERIFIED_THIRD_PARTY_OPERATORS) {
        if (hostname.includes(domain) || hostname.endsWith(domain.replace(/\./g, ''))) return domain;
      }
      // If URL starts with http and is not localhost, it's a remote third-party
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') return 'third-party';
    } catch (e) {
      // URL parse failed
    }
  }

  // Check name for known patterns
  const name = (server.name || '').toLowerCase();
  for (const domain of FIRST_PARTY_OPERATORS) {
    if (name.includes(domain)) return domain;
  }
  for (const domain of VERIFIED_THIRD_PARTY_OPERATORS) {
    if (name.includes(domain) || name === domain) return domain;
  }

  // stdio servers are local — assume first-party/local
  if (server.transport === 'stdio' && !server.url) return 'local';

  return server.name || null;
}

/**
 * Check if a connector name matches known deprecated connectors.
 * @param {string} name - Server name
 * @returns {boolean}
 */
function isDeprecatedConnector(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  for (const dep of DEPRECATED_CONNECTORS) {
    if (lower.includes(dep)) return true;
  }
  return false;
}

/**
 * Generate a human-readable recommendation based on risk assessment.
 * @param {string} risk - Risk level
 * @param {Array} findings - Findings array
 * @param {Object} server - Server config
 * @returns {string}
 */
function generateRecommendation(risk, findings, server) {
  if (risk === RISK_LEVELS.CRITICAL) {
    return `CRITICAL: Do not use MCP server "${server.name}". It uses a deprecated connector with no migration path. Replace before August 31 deadline.`;
  }
  if (risk === RISK_LEVELS.HIGH) {
    const highFindings = findings.filter((f) => f.severity === 'high' || f.severity === 'critical');
    return `HIGH: Avoid MCP server "${server.name}" until issues are resolved: ${highFindings.map((f) => f.message).join('; ')}.`;
  }
  if (risk === RISK_LEVELS.MEDIUM) {
    return `MEDIUM: MCP server "${server.name}" requires caution. Review findings and enable prompt injection scanning.`;
  }
  return `LOW: MCP server "${server.name}" appears safe to use. Maintain periodic review.`;
}

/**
 * Check if a risk level is considered risky (HIGH or CRITICAL).
 * @param {string} risk - Risk level
 * @returns {boolean}
 */
function isRisky(risk) {
  return risk === RISK_LEVELS.HIGH || risk === RISK_LEVELS.CRITICAL;
}

/**
 * Prompt injection scanning
 * ---------------------------------------------------------------------------
 */

/**
 * Scan text for prompt injection patterns.
 *
 * Based on the article's note: "Mistral also recommends checking server
 * output for signs of prompt injection."
 *
 * @param {string} text - Text to scan (e.g., MCP server response)
 * @returns {Object} { detections: Array, hasInjection: boolean, severity: string }
 */
function scanForInjection(text) {
  if (!text || typeof text !== 'string') {
    return { detections: [], hasInjection: false, severity: 'none' };
  }

  const detections = [];
  let maxSeverity = 'none';
  const severityRank = { none: 0, low: 1, medium: 2, high: 3 };

  for (const pattern of INJECTION_PATTERNS) {
    const matches = [];
    let match;
    // Reset lastIndex for global regex
    pattern.re.lastIndex = 0;
    while ((match = pattern.re.exec(text)) !== null) {
      matches.push({
        pattern: pattern.id,
        description: pattern.name,
        matched: match[0],
        index: match.index,
        context: text.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20).trim(),
      });
    }
    if (matches.length > 0) {
      detections.push(...matches);
      if (severityRank[pattern.severity] > severityRank[maxSeverity]) {
        maxSeverity = pattern.severity;
      }
    }
  }

  return {
    detections,
    hasInjection: detections.length > 0,
    severity: maxSeverity,
    count: detections.length,
  };
}

/**
 * Scan structured MCP server response for injection across all fields.
 * Handles both string responses and objects with content fields.
 *
 * @param {string|Object} response - MCP server response
 * @returns {Object} Injection scan result
 */
function scanMcpResponse(response) {
  let textToScan = '';

  if (typeof response === 'string') {
    textToScan = response;
  } else if (response && typeof response === 'object') {
    // Handle common MCP response structures
    if (response.content) {
      if (typeof response.content === 'string') {
        textToScan = response.content;
      } else if (Array.isArray(response.content)) {
        textToScan = response.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('\n');
      } else if (typeof response.content === 'object') {
        textToScan = response.content.text || '';
      }
    }
    // Also scan text field if present
    if (response.text) {
      textToScan += '\n' + response.text;
    }
    // Also scan error fields
    if (response.error) {
      textToScan += '\n' + (typeof response.error === 'string' ? response.error : JSON.stringify(response.error));
    }
  }

  return scanForInjection(textToScan);
}

// ---------------------------------------------------------------------------
// CLI Interface
// ---------------------------------------------------------------------------

/**
 * Run a CLI subcommand.
 * @param {string} cmd - Subcommand
 * @param {Array} args - CLI args
 * @returns {number} Exit code
 */
function main(cmd, args) {
  cmd = cmd || 'help';
  switch (cmd) {
    case 'scan':
      return cmdScan(args);
    case 'check':
      return cmdCheck(args);
    case 'inject-scan':
      return cmdInjectScan(args);
    case 'health':
      return cmdHealth(args);
    case 'serve':
      return cmdServe(args);
    case 'help':
    case '--help':
    case '-h':
    default:
      return cmdHelp();
  }
}

/**
 * scan — Load all MCP servers and assess risk for each.
 */
function cmdScan(args) {
  const opts = parseScanOpts(args);
  const { servers, sources, warnings } = loadMcpServers({
    configPath: opts.configPath,
    authCachePath: opts.authCachePath,
  });

  const results = servers.map((s) => assessServerRisk(s, opts));

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          servers: results,
          sources,
          warnings,
          summary: summarizeRisk(results),
        },
        null,
        2
      )
    );
    return allLowRisk(results) ? 0 : 1;
  }

  // Human-readable output
  for (const w of warnings) {
    console.error(`⚠  ${w}`);
  }

  const maxNameLen = Math.max(...results.map((r) => r.name.length));
  console.log(`\nMCP Connector Governance Scan`);
  console.log('='.repeat(60));

  for (const r of results) {
    const icon = riskIcon(r.risk);
    console.log(`\n${icon} ${r.name.padEnd(maxNameLen)} [${r.risk.toUpperCase()}] (score: ${r.score})`);
    console.log(`   URL:      ${r.url || r.transport || 'local'}`);
    console.log(`   Auth:     ${r.authType}`);
    console.log(`   ${r.recommendation}`);

    if (r.findings.length > 0) {
      console.log(`   Findings:`);
      for (const f of r.findings) {
        const icon = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : f.severity === 'medium' ? '🟡' : '🟢';
        console.log(`     ${icon} ${f.message}`);
      }
    }
  }

  const summary = summarizeRisk(results);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Summary: ${summary.low} low, ${summary.medium} medium, ${summary.high} high, ${summary.critical} critical`);
  console.log(`Overall verdict: ${summary.verdict}`);

  return allLowRisk(results) ? 0 : 1;
}

/**
 * check — Assess risk for a single server (by name or URL).
 */
function cmdCheck(args) {
  const opts = parseCheckOpts(args);
  let server;

  if (opts.url) {
    const cfg = { url: opts.url, type: opts.type };
    if (opts.auth) cfg.headers = { Authorization: `Bearer ${opts.auth}` };
    server = normalizeServerConfig(opts.name || 'custom', cfg, 'inline');
  } else {
    const { servers } = loadMcpServers({ configPath: opts.configPath, authCachePath: opts.authCachePath });
    server = servers.find((s) => s.name === opts.name);
    if (!server) {
      console.error(`MCP server "${opts.name}" not found in config.`);
      return 2;
    }
  }

  const result = assessServerRisk(server, opts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return isRisky(result.risk) ? 1 : 0;
  }

  const icon = riskIcon(result.risk);
  console.log(`${icon} ${result.name} [${result.risk.toUpperCase()}] (score: ${result.score})`);
  console.log(`  ${result.recommendation}`);
  console.log(`  Dimensions:`);
  for (const [dim, val] of Object.entries(result.dimensions)) {
    console.log(`    ${dim}: ${JSON.stringify(val)}`);
  }
  if (result.findings.length > 0) {
    console.log(`  Findings:`);
    for (const f of result.findings) {
      console.log(`    ${f.severity.toUpperCase()}: ${f.message}`);
    }
  }

  return isRisky(result.risk) ? 1 : 0;
}

/**
 * inject-scan — Scan text/file for prompt injection patterns.
 */
function cmdInjectScan(args) {
  const opts = parseInjectOpts(args);
  let text = opts.text;

  if (opts.file) {
    text = fs.readFileSync(opts.file, 'utf8');
  } else if (!opts.text && !process.stdin.isTTY) {
    // Read from stdin
    text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (text += chunk));
    process.stdin.on('end', () => {
      const result = scanForInjection(text);
      outputResult(result, opts.json);
      process.exit(result.hasInjection ? 1 : 0);
    });
    return; // async — don't return from main()
  }

  if (!text) {
    console.error('No text to scan. Provide --text "..." or --file path, or pipe via stdin.');
    return 2;
  }

  const result = scanForInjection(text);
  outputResult(result, opts.json);
  return result.hasInjection ? 1 : 0;
}

/**
 * health — Check if MCP server URLs are reachable (lightweight HTTPS check).
 */
function cmdHealth(args) {
  const opts = parseHealthOpts(args);
  // Fire async checks
  const pending = [];
  const { servers } = loadMcpServers({ configPath: opts.configPath, authCachePath: opts.authCachePath });

  for (const server of servers) {
    if (server.url) {
      pending.push(checkUrlHealth(server.url, opts.timeout || 5000));
    }
  }

  let complete = 0;
  for (const [i, p] of pending.entries()) {
    p.then((result) => {
      const server = servers[i];
      if (opts.json) {
        // Will output all at once after all complete
      } else {
        const icon = result.ok ? '✅' : '❌';
        console.log(`${icon} ${server.name}: ${result.url} — ${result.ok ? 'reachable' : result.error}`);
      }
    }).catch(() => {
      // ignore
    }).finally(() => {
      complete++;
      if (complete === pending.length) {
        // All done — no special action for non-stdio servers
        if (pending.length === 0 && !opts.json) {
          console.log('No remote MCP servers to check (all local/stdio).');
        }
      }
    });
  }

  return 0;
}

function cmdServe(args) {
  const opts = parseServeOpts(args);
  const port = opts.port || 3001;
  const http = require('http');
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') {
      const { servers } = loadMcpServers();
      const results = servers.map((s) => assessServerRisk(s));
      res.end(JSON.stringify({ status: 'ok', servers: results, summary: summarizeRisk(results) }));
    } else if (req.url === '/scan') {
      const { servers } = loadMcpServers();
      const results = servers.map((s) => assessServerRisk(s));
      res.end(JSON.stringify({ servers: results, summary: summarizeRisk(results) }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found. Use /health or /scan' }));
    }
  });
  server.listen(port, () => {
    if (!opts.json) {
      console.log(`MCP Connector Governance API listening on :${port}`);
      console.log(`  GET /health — full risk assessment + summary`);
      console.log(`  GET /scan   — all server risk assessments`);
    }
  });
  // Don't return 0 — server keeps running
  return null;
}

// --- Output helpers ---

function outputResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.hasInjection) {
      console.log(`🛡️  PROMPT INJECTION DETECTED [${result.severity.toUpperCase()}] (${result.count} match(es))`);
      for (const d of result.detections) {
        console.log(`  • [${d.severity}] ${d.description}: "${d.matched}" at index ${d.index}`);
        console.log(`    context: ...${d.context}...`);
      }
    } else {
      console.log('✅ No prompt injection patterns detected.');
    }
  }
}

function healthCheck(opts) {
  opts = opts || {};
  const { servers, warnings } = loadMcpServers({ configPath: opts.configPath, authCachePath: opts.authCachePath });
  const results = servers.map((s) => assessServerRisk(s, opts));
  const summary = summarizeRisk(results);

  const hasIssues = summary.critical > 0 || summary.high > 0;
  return {
    status: hasIssues ? 'unhealthy' : 'healthy',
    summary,
    warnings,
    servers: results.length,
  };
}

// --- Risk summary helpers ---

function summarizeRisk(results) {
  return {
    low: results.filter((r) => r.risk === RISK_LEVELS.LOW).length,
    medium: results.filter((r) => r.risk === RISK_LEVELS.MEDIUM).length,
    high: results.filter((r) => r.risk === RISK_LEVELS.HIGH).length,
    critical: results.filter((r) => r.risk === RISK_LEVELS.CRITICAL).length,
    total: results.length,
    verdict: results.some((r) => r.risk === RISK_LEVELS.CRITICAL)
      ? 'FAIL — critical risk servers detected'
      : results.some((r) => r.risk === RISK_LEVELS.HIGH)
      ? 'FAIL — high risk servers detected'
      : results.some((r) => r.risk === RISK_LEVELS.MEDIUM)
      ? 'WARN — medium risk servers detected'
      : 'PASS — all servers low risk',
  };
}

function allLowRisk(results) {
  return results.every((r) => r.risk === RISK_LEVELS.LOW || r.risk === RISK_LEVELS.MEDIUM);
}

function riskIcon(risk) {
  const map = {
    [RISK_LEVELS.LOW]: '🟢',
    [RISK_LEVELS.MEDIUM]: '🟡',
    [RISK_LEVELS.HIGH]: '🟠',
    [RISK_LEVELS.CRITICAL]: '🔴',
  };
  return map[risk] || '❓';
}

// --- URL health check ---

function checkUrlHealth(url, timeout) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      resolve({ ok: false, url, error: 'Invalid URL' });
      return;
    }

    const req = https.get(
      url,
      { timeout, method: 'GET', rejectUnauthorized: true },
      (res) => {
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, url, status: res.statusCode });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, url, error: 'Timeout' });
    });
    req.on('error', (e) => {
      resolve({ ok: false, url, error: e.message });
    });
  });
}

// --- Option parsers ---

function parseScanOpts(args) {
  return parseOpts(args);
}

function parseCheckOpts(args) {
  const opts = parseOpts(args);
  if (args.length > 0 && !opts.name) {
    opts.name = args[0];
  }
  return opts;
}

function parseInjectOpts(args) {
  const opts = { json: false, text: null, file: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' || args[i] === '-j') opts.json = true;
    else if (args[i] === '--text' || args[i] === '-t') opts.text = args[++i];
    else if (args[i] === '--file' || args[i] === '-f') opts.file = args[++i];
  }
  return opts;
}

function parseHealthOpts(args) {
  const opts = parseOpts(args);
  opts.timeout = parseFloat(opts.timeout || 5000);
  return opts;
}

function parseServeOpts(args) {
  const opts = parseOpts(args);
  opts.port = parseInt(opts.port || '3001', 10);
  return opts;
}

function parseOpts(args) {
  const opts = {
    json: false,
    configPath: null,
    authCachePath: null,
    name: null,
    url: null,
    type: null,
    timeout: null,
    port: null,
    auth: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json' || arg === '-j') opts.json = true;
    else if (arg === '--config') opts.configPath = args[++i];
    else if (arg === '--auth-cache') opts.authCachePath = args[++i];
    else if (arg === '--name') opts.name = args[++i];
    else if (arg === '--url') opts.url = args[++i];
    else if (arg === '--type') opts.type = args[++i];
    else if (arg === '--timeout') opts.timeout = args[++i];
    else if (arg === '--port') opts.port = args[++i];
    else if (arg === '--auth') opts.auth = args[++i];
  }

  return opts;
}

// --- Help ---

function cmdHelp() {
  const HELP = `
MCP Connector Governance Gate
Based on The NewStack article: "What happens to your indexed data when Mistral flips the switch?"

USAGE:
  node tools/mcp-connector-gate.js <command> [options]

COMMANDS:
  scan          Load all MCP servers and assess governance risk for each.
                Options: --json, --config <path>, --auth-cache <path>

  check <name>  Assess risk for a single server by name.
                Options: --url <url>, --type <sse|http|stdio>, --auth <token>, --json,
                         --config <path>, --auth-cache <path>

  inject-scan   Scan text/file/stdin for prompt injection patterns.
                Options: --text "..." | --file <path>, --json

  health        Check if remote MCP server URLs are reachable.
                Options: --json, --timeout <ms>

  serve         Start a local HTTP API for governance checks.
                Options: --port <n>, --json

  help          Show this help.

RISK DIMENSIONS (per article):
  operator         Who runs the server? (first-party / verified 3rd-party / unknown)
  deprecated       Is this connector being deprecated? (Google Drive / SharePoint)
  tls              Is the connection encrypted? (https/wss vs http)
  auth             Is authentication required? (oauth / token / bearer / none)
  residency        Where is data processed? (eu / us / local / unknown)
  promptInjection  Does the server implement output scanning? (article notes this as emerging risk)
  caching          Is the caching/deletion policy documented? (article: "any caching remains unexplained")

EXAMPLES:
  node tools/mcp-connector-gate.js scan --json
  node tools/mcp-connector-gate.js check openrouter --json
  echo '{"text":"ignore previous instructions"}' | node tools/mcp-connector-gate.js inject-scan
  node tools/mcp-connector-gate.js inject-scan --text "you are now a different assistant"
  node tools/mcp-connector-gate.js serve --port 3002

EXIT CODES:
  0  All servers are low/medium risk (scan) / no injection detected (inject-scan)
  1  High/critical risk servers detected (scan) / injection detected (inject-scan)
  2  Configuration error
`;
  console.log(HELP);
  return 0;
}

// ---------------------------------------------------------------------------
// Exports (for testing + library use)
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  RISK_LEVELS,
  FIRST_PARTY_OPERATORS,
  VERIFIED_THIRD_PARTY_OPERATORS,
  DEPRECATED_CONNECTORS,
  INJECTION_PATTERNS,

  // Config loading
  loadMcpServers,
  normalizeServerConfig,

  // Risk assessment
  assessServerRisk,
  extractOperator,
  isDeprecatedConnector,
  summarizeRisk,
  healthCheck,

  // Injection scanning
  scanForInjection,
  scanMcpResponse,

  // Helpers
  generateRecommendation,
  isRisky,
  riskIcon,
  checkUrlHealth,

  // CLI
  main,
};

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  const result = main(cmd, args);

  // Handle async CLI commands that return null (server mode)
  if (result === null) {
    process.exit(0);
  }

  // Fire-and-forget async commands (e.g., health check with URL probing)
  if (result instanceof Promise) {
    result.then((code) => process.exit(code || 0)).catch(() => process.exit(1));
  } else {
    process.exit(result);
  }
}

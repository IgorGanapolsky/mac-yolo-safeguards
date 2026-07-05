#!/usr/bin/env node
'use strict';

/**
 * Hermes Page-Agent DOM Controller
 *
 * A lightweight, dependency-free in-page helper for DOM dehydration,
 * actions translation, and JS-injection code generation.
 * Used to automate webviews and web interfaces with minimal CPU/bandwidth footprint.
 */

const fs = require('fs');
const path = require('path');

// Extract basic attributes from a tag string
function parseAttributes(tagStr) {
  const attrs = {};
  const regex = /([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
  let match;
  
  // Clean up tag string for attribute parsing
  const cleanStr = tagStr.replace(/^<[a-zA-Z0-9_-]+\s*/, '').replace(/\/?>$/, '');
  
  while ((match = regex.exec(cleanStr)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] || match[3] || match[4] || '';
    attrs[key] = val;
  }
  return attrs;
}

// Strip HTML tags to get pure innerText
function cleanText(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dehydrates HTML into a compact list of interactive elements.
 */
function dehydrateDOM(html) {
  const elements = [];
  let elementIdCounter = 0;
  
  // Extract A, BUTTON, INPUT, TEXTAREA, SELECT
  const tagRegex = /<(a|button|input|textarea|select)([\s\S]*?)>([\s\S]*?)<\/\1>|<(input|textarea|select)([\s\S]*?)\/?>/gi;
  let match;
  
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = (match[1] || match[4]).toLowerCase();
    const attrsStr = match[2] || match[5] || '';
    const innerHtml = match[3] || '';
    
    const attrs = parseAttributes(attrsStr);
    const text = cleanText(innerHtml) || attrs.value || attrs.placeholder || '';
    
    // Skip hidden inputs
    if (tagName === 'input' && attrs.type === 'hidden') {
      continue;
    }
    
    elementIdCounter++;
    const element = {
      id: `pa-${elementIdCounter}`,
      tag: tagName,
      text: text.substring(0, 100),
      attributes: {}
    };
    
    // Save relevant attributes
    ['id', 'name', 'class', 'placeholder', 'type', 'value', 'href', 'role'].forEach(attr => {
      if (attrs[attr]) {
        element.attributes[attr] = attrs[attr];
      }
    });
    
    elements.push(element);
  }
  
  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    elements
  };
}

/**
 * Translates a natural language command into a structured action based on the dehydrated DOM.
 */
function translateCommand(command, dehydratedDOM) {
  const cmd = command.toLowerCase();
  const elements = dehydratedDOM.elements;
  
  // 1. Simple Click matching
  if (cmd.includes('click') || cmd.includes('tap') || cmd.includes('press')) {
    const rawTarget = cmd.replace(/^(click|tap|press)\s+(on\s+)?(the\s+)?/, '').trim();
    const target = rawTarget.replace(/\s+(button|link|input|field|tab|menu|icon)$/i, '').trim();
    
    // Try to find matching element by text or attributes
    for (const el of elements) {
      const elText = el.text.toLowerCase();
      const elId = (el.attributes.id || '').toLowerCase();
      const elName = (el.attributes.name || '').toLowerCase();
      const elRole = (el.attributes.role || '').toLowerCase();
      
      if (
        (elText && (elText.includes(target) || target.includes(elText))) ||
        (elId && (elId === target || elId.includes(target))) ||
        (elName && (elName === target || elName.includes(target))) ||
        (elRole && (elRole === target || elRole.includes(target))) ||
        (target === 'submit' && el.tag === 'button' && (elText.includes('submit') || elText.includes('send')))
      ) {
        return {
          action: 'click',
          targetId: el.id,
          tag: el.tag,
          description: `Click ${el.tag} containing "${el.text}"`
        };
      }
    }
  }

  
  // 2. Simple Input matching (e.g., "type test@email.com in email", "enter password in password field")
  if (cmd.includes('type') || cmd.includes('enter') || cmd.includes('fill')) {
    let value = '';
    let target = '';
    
    // Parse: type <value> into/in <target>
    const matchType = cmd.match(/(?:type|enter|fill)\s+["']?([^"']+)["']?\s+(?:into|in|on)\s+(?:the\s+)?(["']?[a-zA-Z0-9\s_-]+["']?)/i);
    if (matchType) {
      value = matchType[1].trim();
      target = matchType[2].replace(/["']/g, '').trim();
    }
    
    if (target && value) {
      for (const el of elements) {
        if (el.tag === 'input' || el.tag === 'textarea') {
          const elId = (el.attributes.id || '').toLowerCase();
          const elName = (el.attributes.name || '').toLowerCase();
          const elPlaceholder = (el.attributes.placeholder || '').toLowerCase();
          
          if (
            (elId && elId.includes(target)) ||
            (elName && elName.includes(target)) ||
            (elPlaceholder && elPlaceholder.includes(target))
          ) {
            return {
              action: 'input',
              targetId: el.id,
              tag: el.tag,
              value: value,
              description: `Type "${value}" into ${el.tag} [${elName || elId || elPlaceholder}]`
            };
          }
        }
      }
    }
  }
  
  // Fallback / No match
  return {
    action: 'unknown',
    description: `Could not translate command: "${command}"`
  };
}

/**
 * Generates an injectable JavaScript snippet to execute the action in-page.
 */
function generateInjectionJS(action, dehydratedDOM) {
  if (!action || action.action === 'unknown') {
    return 'console.error("Hermes Page-Agent: Unknown action");';
  }
  
  const element = dehydratedDOM.elements.find(el => el.id === action.targetId);
  if (!element) {
    return `console.error("Hermes Page-Agent: Target element ${action.targetId} not found");`;
  }
  
  // Construct a safe, precise DOM selector query
  let selector = element.tag;
  if (element.attributes.id) {
    selector += `[id="${element.attributes.id}"]`;
  } else if (element.attributes.name) {
    selector += `[name="${element.attributes.name}"]`;
  } else if (element.attributes.placeholder) {
    selector += `[placeholder="${element.attributes.placeholder}"]`;
  } else if (element.attributes.href) {
    selector += `[href="${element.attributes.href}"]`;
  }
  
  // Escape backslashes/quotes in selector
  const cleanSelector = selector.replace(/"/g, '\\"');
  
  if (action.action === 'click') {
    return `(function() {
      const el = document.querySelector("${cleanSelector}");
      if (el) {
        el.click();
        return { success: true, elementId: "${element.id}" };
      }
      return { success: false, reason: "Element not found" };
    })();`;
  }
  
  if (action.action === 'input') {
    const cleanValue = action.value.replace(/"/g, '\\"');
    return `(function() {
      const el = document.querySelector("${cleanSelector}");
      if (el) {
        el.value = "${cleanValue}";
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, elementId: "${element.id}", value: "${cleanValue}" };
      }
      return { success: false, reason: "Element not found" };
    })();`;
  }
  
  return 'console.error("Hermes Page-Agent: Unsupported action type");';
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command || command === '--help' || command === '-h') {
    console.log(`Hermes Page-Agent DOM Controller CLI
Usage:
  node tools/hermes-page-agent.js dehydrate <html_file> [--json]
  node tools/hermes-page-agent.js translate <html_file> <natural_language_command> [--json]
  node tools/hermes-page-agent.js generate <html_file> <natural_language_command> [--json]
`);
    process.exit(0);
  }
  
  if (command === 'dehydrate') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Error: html_file argument required');
      process.exit(1);
    }
    const html = fs.readFileSync(filePath, 'utf8');
    const dehydrated = dehydrateDOM(html);
    console.log(JSON.stringify(dehydrated, null, 2));
    process.exit(0);
  }
  
  if (command === 'translate') {
    const filePath = args[1];
    const userCmd = args[2];
    if (!filePath || !userCmd) {
      console.error('Error: html_file and command arguments required');
      process.exit(1);
    }
    const html = fs.readFileSync(filePath, 'utf8');
    const dehydrated = dehydrateDOM(html);
    const action = translateCommand(userCmd, dehydrated);
    console.log(JSON.stringify(action, null, 2));
    process.exit(0);
  }
  
  if (command === 'generate') {
    const filePath = args[1];
    const userCmd = args[2];
    if (!filePath || !userCmd) {
      console.error('Error: html_file and command arguments required');
      process.exit(1);
    }
    const html = fs.readFileSync(filePath, 'utf8');
    const dehydrated = dehydrateDOM(html);
    const action = translateCommand(userCmd, dehydrated);
    const js = generateInjectionJS(action, dehydrated);
    console.log(js);
    process.exit(0);
  }
}

module.exports = {
  dehydrateDOM,
  translateCommand,
  generateInjectionJS,
  parseAttributes,
  cleanText
};

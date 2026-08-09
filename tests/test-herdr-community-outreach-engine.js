'use strict';

/**
 * Unit Tests for Herdr Community Outreach Engine (`tools/herdr-community-outreach-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const {
  generateGithubPluginRfc,
  generateRedditTechnicalPost,
  generateLinkedinMaintainerPitch
} = require('../tools/herdr-community-outreach-engine');

console.log('Running test-herdr-community-outreach-engine.js...');

// Test 1: GitHub RFC Proposal Generation
{
  const rfc = generateGithubPluginRfc();
  assert.strictEqual(rfc.readyForPost, true, 'Expected readyForPost to be true');
  assert.ok(rfc.body.includes('herdr-plugin-thumbgate'), 'Expected herdr-plugin-thumbgate in body');
  assert.ok(rfc.body.includes('cl100k_base'), 'Expected BPE token encoding in body');
}

// Test 2: Reddit Technical Breakdown Post
{
  const reddit = generateRedditTechnicalPost();
  assert.strictEqual(reddit.platform, 'reddit', 'Expected platform === reddit');
  assert.strictEqual(reddit.subreddit, 'r/AI_Agents', 'Expected subreddit === r/AI_Agents');
  assert.ok(reddit.body.includes('herdrv.dev'), 'Expected herdrv.dev link in body');
}

// Test 3: LinkedIn Maintainer Pitch
{
  const linkedin = generateLinkedinMaintainerPitch();
  assert.strictEqual(linkedin.recipient, 'Herdr Maintainers / Founder', 'Expected Herdr recipient');
  assert.ok(linkedin.message.includes('Igor Ganapolsky'), 'Expected Igor Ganapolsky signature');
}

console.log('ok tests/test-herdr-community-outreach-engine.js');

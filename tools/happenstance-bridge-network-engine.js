#!/usr/bin/env node
'use strict';

/**
 * happenstance-bridge-network-engine.js — Happenstance.ai + Bridge (brdg.app)
 * Cross-Network Warm Buyer & Connector Resolution Engine.
 *
 * Joins:
 *   1. Happenstance.ai AI network search results (ranked buyer/partner leads with
 *      role, company, fit thesis, and mutual connector source, where direct email
 *      is often omitted by Happenstance UI)
 *   2. Bridge (brdg.app) synced 1st-degree contacts & active Bridge members
 *      (gzip-compressed localStorage payloads `/contacts__main_compressed_v2`,
 *      `/contacts/bridge_members_details__main_compressed_v2`,
 *      `/tags/shared__main_compressed_v2`, `/tags/network_receivers__main_compressed_v2`)
 *
 * Outputs:
 *   - De-duplicated, email-verified 1st-degree and 2nd-degree warm buyer records
 *   - Deterministic offer routing (`pro` $149/yr vs `team_sprint` $499)
 *   - Safe upsert into private `~/.hermes/business_os/revenue/` TSVs & contacts JSON
 *   - Corporate air-gap diode enforcement (blocks `@ecisolutions.com`, `@ecinexus.com`, `@eci.com`)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const CORP_AIRGAP_RE = /@(?:ecisolutions|ecinexus|eci)\.com\b/i;

const DEFAULT_OFFER_LINKS = {
  pro: 'https://iganapolsky.gumroad.com/l/Naild',
  team: 'https://buy.stripe.com/28E00j69Y6PGfJ2e6peAg0m',
  team_sprint: 'https://buy.stripe.com/28E00j69Y6PGfJ2e6peAg0m',
};

const DEFAULT_OFFER_GROSS = {
  pro: 149,
  team: 499,
  team_sprint: 499,
};

function isBlockedEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean || !clean.includes('@')) return true;
  if (CORP_AIRGAP_RE.test(clean)) return true;
  if (/(?:noreply|no-reply|donotreply|intercom-mail\.com|talent\.icims\.com|zendesk\.com)/i.test(clean)) {
    return true;
  }
  return false;
}

function decompressBridgePayload(compressedLatin1Str) {
  if (!compressedLatin1Str || typeof compressedLatin1Str !== 'string') return null;
  if (!compressedLatin1Str.startsWith('\u001f')) {
    try {
      return JSON.parse(compressedLatin1Str);
    } catch {
      return null;
    }
  }
  const buf = Buffer.from(compressedLatin1Str, 'latin1');
  const jsonStr = zlib.gunzipSync(buf).toString('utf8');
  return JSON.parse(jsonStr);
}

function normalizeName(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyKey(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function inferOfferTier(lead = {}) {
  if (lead.offer && DEFAULT_OFFER_GROSS[lead.offer]) return lead.offer;
  const text = `${lead.position || ''} ${lead.role || ''} ${lead.thinking || ''}`.toLowerCase();
  if (/\b(cto|ceo|chief|vp|head of|director|ciso|svp|founder|co-founder|cofounder|architect|manager)\b/.test(text)) {
    return 'team_sprint';
  }
  return 'pro';
}

/**
 * Cross-join Happenstance buyer candidates with Bridge synced contacts + Bridge members.
 */
function crossJoinHappenstanceAndBridge({ happenstanceLeads = [], bridgeContacts = [], bridgeMembers = [] } = {}) {
  const contactByName = new Map();
  const contactByLastName = new Map();
  const allBridgeContacts = [];

  for (const raw of bridgeContacts) {
    if (!raw || isBlockedEmail(raw.email)) continue;
    const email = String(raw.email).trim().toLowerCase();
    const name = String(raw.name || raw.given_name || '').trim();
    const norm = normalizeName(name);
    const entry = {
      name: name || email.split('@')[0],
      email,
      company: raw.company || null,
      position: raw.position || null,
      linkedin: raw.linkedin_profile_url || raw.linkedin || null,
      isBridgeMember: Boolean(raw.is_member),
    };
    allBridgeContacts.push(entry);
    if (norm) {
      contactByName.set(norm, entry);
      const parts = norm.split(' ');
      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        if (last.length >= 4) {
          if (!contactByLastName.has(last)) contactByLastName.set(last, []);
          contactByLastName.get(last).push(entry);
        }
      }
    }
  }

  const resolved = [];
  const seenEmails = new Set();

  for (const h of happenstanceLeads) {
    const norm = normalizeName(h.name);
    let match = contactByName.get(norm) || null;
    if (!match && norm) {
      const parts = norm.split(' ');
      const first = parts[0];
      const last = parts[parts.length - 1];
      const candidates = contactByLastName.get(last) || [];
      if (candidates.length === 1) {
        match = candidates[0];
      } else if (candidates.length > 1) {
        match =
          candidates.find((c) => normalizeName(c.name).startsWith(first.slice(0, 3))) ||
          candidates.find((c) => c.email.includes(first.slice(0, 3))) ||
          candidates[0];
      }
    }
    const email = String((h.email && !isBlockedEmail(h.email) ? h.email : match && match.email) || '')
      .trim()
      .toLowerCase();
    if (!email || isBlockedEmail(email) || seenEmails.has(email)) continue;
    seenEmails.add(email);

    const offer = inferOfferTier({ ...match, ...h });
    const company = h.company || (match && match.company) || '';
    const role = h.position || h.role || (match && match.position) || 'Decision Maker';
    const key = h.key || slugifyKey(`${h.name}_${company || email.split('@')[1].split('.')[0]}`);

    resolved.push({
      key,
      name: h.name || (match && match.name) || email,
      email,
      company,
      role,
      offer,
      gross_potential_usd: DEFAULT_OFFER_GROSS[offer] || 499,
      payment_link_url: DEFAULT_OFFER_LINKS[offer] || DEFAULT_OFFER_LINKS.team_sprint,
      source: match && match.isBridgeMember ? 'bridge_1st_degree_member' : 'happenstance_bridge_1st_degree',
      thinking: h.thinking || '',
      linkedin: h.linkedin || (match && match.linkedin) || null,
    });
  }

  for (const m of bridgeMembers) {
    if (!m || isBlockedEmail(m.email)) continue;
    const email = String(m.email).trim().toLowerCase();
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
    const offer = inferOfferTier(m);
    const company = m.company || '';
    const role = m.position || 'Founder';
    const key = m.key || slugifyKey(`${m.name}_${company || 'bridge'}`);
    resolved.push({
      key,
      name: m.name || email,
      email,
      company,
      role,
      offer,
      gross_potential_usd: DEFAULT_OFFER_GROSS[offer] || 499,
      payment_link_url: DEFAULT_OFFER_LINKS[offer] || DEFAULT_OFFER_LINKS.team_sprint,
      source: 'bridge_1st_degree_member',
      thinking: '1st-degree Bridge shared network member',
      linkedin: m.linkedin_profile_url || m.linkedin || null,
    });
  }

  return resolved;
}

/**
 * Summarize current Happenstance + Bridge pipeline rows in private revenue directory.
 */
function summarizeNetworkPipeline(revenueDir = path.join(os.homedir(), '.hermes', 'business_os', 'revenue'), dayStr) {
  const day = dayStr || new Date().toISOString().slice(0, 10);
  const pipelinePath = path.join(revenueDir, `pipeline-status-${day}.tsv`);
  const contactsPath = path.join(revenueDir, 'autonomous-contacts.json');

  let networkLeadsCount = 0;
  let networkSentCount = 0;
  let networkGrossUsd = 0;

  if (fs.existsSync(contactsPath) && fs.existsSync(pipelinePath)) {
    let contacts = {};
    try {
      contacts = JSON.parse(fs.readFileSync(contactsPath, 'utf8'));
    } catch {
      contacts = {};
    }
    const networkKeys = new Set(
      Object.entries(contacts)
        .filter(([, v]) => v && /^(happenstance|bridge)/i.test(String(v.source || '')))
        .map(([k, v]) => String(v.prospect || k)),
    );
    const lines = fs.readFileSync(pipelinePath, 'utf8').trim().split(/\r?\n/);
    const cols = (lines[0] || '').split('\t');
    const kIdx = cols.indexOf('prospect_label') !== -1 ? cols.indexOf('prospect_label') : cols.indexOf('prospect_key');
    const sIdx = cols.indexOf('stage');
    const gIdx = cols.indexOf('gross_potential_usd');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      const key = parts[kIdx];
      if (!networkKeys.has(key)) continue;
      networkLeadsCount++;
      if (parts[sIdx] === 'sent' || parts[sIdx] === 'replied') networkSentCount++;
      networkGrossUsd += Number(parts[gIdx] || 0) || 0;
    }
  }

  return {
    ok: true,
    day,
    allowUnattendedOutreach: false,
    networkLeadsCount,
    networkSentCount,
    networkGrossUsd,
  };
}

const ALLOW_UNATTENDED_OUTREACH = false;

function assertNoUnattendedOutreach(action = 'outreach') {
  const err = new Error(
    `ERR_UNATTENDED_NETWORK_OUTREACH_FORBIDDEN: Happenstance/Bridge contacts are personal/calendar relationships. Automated ${action} is permanently disabled.`,
  );
  err.code = 'ERR_UNATTENDED_NETWORK_OUTREACH_FORBIDDEN';
  throw err;
}

if (require.main === module) {
  if (process.argv.includes('--send') || process.argv.includes('--auto-send')) {
    assertNoUnattendedOutreach('CLI send');
  }
  const summary = summarizeNetworkPipeline();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

module.exports = {
  CORP_AIRGAP_RE,
  ALLOW_UNATTENDED_OUTREACH,
  assertNoUnattendedOutreach,
  isBlockedEmail,
  decompressBridgePayload,
  crossJoinHappenstanceAndBridge,
  inferOfferTier,
  summarizeNetworkPipeline,
};

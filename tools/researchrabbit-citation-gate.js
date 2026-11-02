'use strict';

/**
 * Checks from a ResearchRabbit library.
 * Source: https://app.researchrabbit.ai/
 *
 * A collection title, a paper with an author and a title, and a buyer
 * email are shapes. This module does not sign in, write an outreach pack,
 * send mail, or buy an upgrade.
 */

const SOURCE = 'https://app.researchrabbit.ai/';

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function paperNamed(paper) {
  return Boolean(paper) && typeof paper === 'object' && filled(paper.author) && filled(paper.title);
}

function assessResearchRabbit({
  displayName,
  accountEmail,
  collectionTitle,
  collectionUrl,
  papers,
} = {}) {
  const list = Array.isArray(papers) ? papers : [];
  const named = list.filter(paperNamed);
  const emailText = typeof accountEmail === 'string' ? accountEmail.trim() : '';
  const collection = typeof collectionUrl === 'string' ? collectionUrl.trim() : '';
  return {
    source: SOURCE,
    passed: false,
    files_written: false,
    monetization_pack_written: false,
    monetization_pack_path: null,
    outreach_sent: false,
    upgrade_purchased: false,
    display_name_named: filled(displayName),
    account_email_seen: false,
    authenticated_google_sso: null,
    caller_email_accepted: false,
    caller_email_present: emailText.length > 0,
    collection_title_named: filled(collectionTitle),
    collection_url_named: collection.startsWith('https://app.researchrabbit.ai/library/collection/'),
    live_search_url: null,
    papers_named: named.length,
    discovered_guardrail_papers_count: named.length,
    buyer_emails_named: 0,
    buyer_emails_accepted: false,
    titles_echoed: false,
    outbound_spend_usd: null,
    cash_received_usd: null,
    vendor_counts_stored: false,
  };
}

module.exports = {
  assessResearchRabbit,
};

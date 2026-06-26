'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectAppProfile,
  discoverCallstackSlugs,
  parseRssItems,
  scoreNewsletterItem,
} = require('../tools/react-native-newsletter-ingest');

const sampleRss = `<?xml version="1.0"?>
<rss><channel>
<item>
<title><![CDATA[Agent Device and Maestro for React Native E2E]]></title>
<link>https://shift.infinite.red/agent-device-maestro?source=rss</link>
<pubDate>Thu, 18 Jun 2026 12:00:00 GMT</pubDate>
<description><![CDATA[Maestro flows with agent-device for faster device testing.]]></description>
</item>
</channel></rss>`;

const rssItems = parseRssItems(sampleRss, 5);
assert.strictEqual(rssItems.length, 1);
assert.strictEqual(rssItems[0].publisher, 'Infinite Red (Red Shift)');

const callstackHtml =
  '<a href="/newsletters/apex-agent-device-expo-sdk-56-inspector-and-react-native-evals">Apex</a>' +
  '<a href="/newsletters/agent-device-react-native-0-85-expo-ui-skillgym-and-react-native-evals">April</a>';
const slugs = discoverCallstackSlugs(callstackHtml);
assert.ok(slugs.includes('/newsletters/apex-agent-device-expo-sdk-56-inspector-and-react-native-evals'));

const profile = collectAppProfile();
assert.ok(profile.maestroFlowCount >= 1, 'expected maestro flows in hermes-mobile');
assert.ok(profile.hasMaestroScripts);
assert.ok(profile.hasPreflightAcceleratedE2e, 'release-preflight.sh must run npm run e2e:accelerated');

const maestroItem = scoreNewsletterItem(
  {
    source: 'callstack',
    publisher: 'Callstack',
    title: 'Apex, Agent Device, Expo SDK 56, Inspector, and React Native Evals',
    url: 'https://www.callstack.com/newsletters/apex-agent-device-expo-sdk-56-inspector-and-react-native-evals',
    publishedAt: new Date().toISOString(),
    summary:
      'faster Agent Device with Maestro support, Expo SDK 56, Inspector tooling, React Native Evals, npm supply-chain',
  },
  profile,
  [],
);

assert.ok(maestroItem.roiScore >= 45, `expected high ROI, got ${maestroItem.roiScore}`);
assert.ok(maestroItem.ruleHits.some((hit) => hit.id === 'agent-device-maestro'));
assert.match(maestroItem.recommendation, /e2e:accelerated|Maestro/i);

const staleRunTop = [maestroItem, scoreNewsletterItem(
  {
    source: 'callstack',
    publisher: 'Callstack',
    title: 'React Native Evals and Expo SDK',
    url: 'https://www.callstack.com/newsletters/react-native-evals-expo-sdk-55-and-webassembly-in-hermes',
    publishedAt: new Date().toISOString(),
    summary: 'Expo SDK 55 upgrade path and React Native evals for testing',
  },
  profile,
  [],
)].filter((item) => item.roiScore >= 45);
assert.ok(staleRunTop.length >= 1, 're-run should still rank fetched items when nothing is new');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-newsletter-test-'));
const statePath = path.join(tempDir, 'state.json');
fs.writeFileSync(statePath, JSON.stringify({ seenUrls: [] }));

console.log('react-native-newsletter-ingest tests: PASS');

'use strict';

const assert = require('assert');
const {
  isPeerOnline,
  isMobilePeer,
  peerHostsFromStatusJson,
} = require('../tools/hermes-discover-tailscale-macs.js');

const sampleStatus = {
  Self: {
    HostName: 'Igors-MacBook-Pro',
    DNSName: 'igors-macbook-pro-1.tail12aa33.ts.net.',
    OS: 'macOS',
    TailscaleIPs: ['100.87.85.85'],
  },
  Peer: {
    offlineMac: {
      HostName: 'FWH-Mac-C7JJF0JY2P',
      Online: false,
      OS: 'macOS',
      TailscaleIPs: ['100.118.0.126'],
    },
    onlineMini: {
      HostName: 'Igors-Mac-mini',
      Online: true,
      OS: 'macOS',
      TailscaleIPs: ['100.94.135.78'],
    },
    phone: {
      HostName: "Igor's S25",
      Online: true,
      OS: 'android',
      TailscaleIPs: ['100.70.124.54'],
    },
    staleLocalhost: {
      HostName: 'localhost',
      online: false,
      OS: 'macOS',
      TailscaleIPs: ['100.72.246.119'],
    },
  },
};

assert.strictEqual(isPeerOnline({ Online: true }), true);
assert.strictEqual(isPeerOnline({ Online: false }), false);
assert.strictEqual(isPeerOnline({ online: false }), false);

assert.strictEqual(isMobilePeer({ OS: 'android' }), true);
assert.strictEqual(isMobilePeer({ OS: 'ios' }), true);
assert.strictEqual(isMobilePeer({ HostName: 'Igor-iPhone' }), true);
assert.strictEqual(isMobilePeer({ OS: 'macOS', HostName: 'Igors-Mac-mini' }), false);

const hosts = peerHostsFromStatusJson(sampleStatus);
assert(!hosts.includes('100.118.0.126'), 'offline peer must be skipped');
assert(!hosts.includes('100.72.246.119'), 'offline localhost peer must be skipped');
assert(!hosts.includes('100.70.124.54'), 'phone peer must be skipped');
assert(hosts.includes('100.94.135.78'), 'online Mac mini must be included');
assert(hosts.includes('100.87.85.85'), 'self Mac tailnet IP must be included (T-222: MBP in picker)');
assert(
  hosts.includes('igors-macbook-pro-1.tail12aa33.ts.net'),
  'self MagicDNS name must be included without trailing dot',
);

const phoneSelfStatus = {
  Self: { HostName: "Igor's S25", OS: 'android', TailscaleIPs: ['100.70.124.54'] },
  Peer: sampleStatus.Peer,
};
const phoneSelfHosts = peerHostsFromStatusJson(phoneSelfStatus);
assert(!phoneSelfHosts.includes('100.70.124.54'), 'mobile self must stay excluded');

console.log('ok   tests/test-hermes-discover-tailscale-macs.js');

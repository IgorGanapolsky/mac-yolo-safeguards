#!/usr/bin/env node

const { execFileSync } = require("node:child_process");

const gatewayUrl = "http://192.168.12.1/TMI/v1/gateway?get=all";
const samples = Number(process.argv.find((arg) => arg.startsWith("--samples="))?.split("=")[1] || 12);
const intervalMs = Number(process.argv.find((arg) => arg.startsWith("--interval-ms="))?.split("=")[1] || 5000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sh(command, args, timeout = 8000) {
  return execFileSync(command, args, { encoding: "utf8", timeout }).trim();
}

function gateway() {
  return JSON.parse(sh("curl", ["-fsS", "--max-time", "4", gatewayUrl], 6000));
}

function ping(host, count = 10) {
  const out = sh("ping", ["-c", String(count), "-i", "0.2", host], 15000);
  const loss = out.match(/([\d.]+)% packet loss/);
  const rtt = out.match(/round-trip min\/avg\/max\/stddev = ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/);
  return {
    host,
    lossPct: loss ? Number(loss[1]) : null,
    avgMs: rtt ? Number(rtt[2]) : null,
    maxMs: rtt ? Number(rtt[3]) : null,
  };
}

function score(signal) {
  const five = signal["5g"];
  const lte = signal["4g"];
  if (!five && !lte) return null;
  // Prioritize 5G quality for n41 stability: SINR > RSRQ > RSRP, with LTE as a tie-breaker.
  let totalScore = 0;
  if (five) {
    totalScore += (five.sinr || 0) * 10 + (five.rsrq || 0) * 2 + (five.rsrp || 0) * 0.4;
  }
  if (lte) {
    totalScore += (lte.sinr || 0) * 2 + (lte.rsrq || 0) * 0.5;
  }
  return totalScore;
}

function formatRadio(name, radio) {
  if (!radio) return `${name} unavailable`;
  return `${name} ${radio.bands?.join(",") || "?"} bars=${radio.bars} rsrp=${radio.rsrp} rsrq=${radio.rsrq} sinr=${radio.sinr}`;
}

async function main() {
  const rows = [];
  console.log(`Sampling ${samples} gateway readings every ${intervalMs}ms...`);
  for (let i = 0; i < samples; i += 1) {
    const now = new Date().toLocaleTimeString();
    const data = gateway();
    const signal = data.signal;
    const sampleScore = score(signal);
    if (sampleScore == null) {
      console.log(`${now} skipping incomplete gateway sample: ${JSON.stringify(signal)}`);
      if (i < samples - 1) await sleep(intervalMs);
      continue;
    }
    const row = {
      time: now,
      score: sampleScore,
      lte: signal["4g"],
      five: signal["5g"],
    };
    rows.push(row);
    console.log(
      `${now} score=${row.score.toFixed(1)} | ${formatRadio("4G", row.lte)} | ${formatRadio("5G", row.five)}`
    );
    if (i < samples - 1) await sleep(intervalMs);
  }

  if (rows.length === 0) {
    throw new Error("No complete gateway signal samples were returned.");
  }

  const best = rows.toSorted((a, b) => b.score - a.score)[0];
  const latest = rows[rows.length - 1];
  console.log("\nBest sample:");
  console.log(`${best.time} score=${best.score.toFixed(1)} | ${formatRadio("4G", best.lte)} | ${formatRadio("5G", best.five)}`);
  console.log("\nLatest sample:");
  console.log(`${latest.time} score=${latest.score.toFixed(1)} | ${formatRadio("4G", latest.lte)} | ${formatRadio("5G", latest.five)}`);

  console.log("\nLatency checks:");
  for (const host of ["192.168.12.1", "1.1.1.1", "8.8.8.8"]) {
    const result = ping(host);
    console.log(`${host} loss=${result.lossPct}% avg=${result.avgMs}ms max=${result.maxMs}ms`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

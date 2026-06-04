'use strict';

const fs = require('fs');

function datedSuffix(name) {
  const match = String(name || '').match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function discover(prefix, date) {
  return fs.readdirSync(process.cwd())
    .filter((name) => name.startsWith(prefix))
    .filter((name) => name.endsWith('.tsv'))
    .filter((name) => name.includes(date))
    .filter((name) => !name.includes('.example.'))
    .sort();
}

function availableDates(prefix) {
  return new Set(
    fs.readdirSync(process.cwd())
      .filter((name) => name.startsWith(prefix))
      .filter((name) => name.endsWith('.tsv'))
      .filter((name) => !name.includes('.example.'))
      .map(datedSuffix)
      .filter(Boolean)
  );
}

function latestDataDate(requestedDate, requirements) {
  const candidates = Array.from(availableDates(requirements[0]))
    .filter((date) => date <= requestedDate)
    .filter((date) => requirements.every((prefix) => availableDates(prefix).has(date)))
    .sort();
  return candidates[candidates.length - 1] || null;
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(value.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

module.exports = {
  discover,
  latestDataDate,
  nextDate,
};

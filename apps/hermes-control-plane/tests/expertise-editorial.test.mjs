import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("expertise track is surfaced and cites live D1 data", async () => {
  const [
    landing,
    llms,
    sitemap,
    expertisePage,
    expertiseClient,
    expertiseData,
    expertiseRoute,
  ] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/expertise/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/expertise/ExpertiseClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/expertise-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/expertise/stats/route.ts", import.meta.url), "utf8"),
  ]);

  // Landing promotes the expertise page without naming the founder.
  assert.match(landing, /id="expertise"/);
  assert.match(landing, /href="\/expertise"/);
  assert.match(landing, /Live telemetry/);
  assert.match(landing, /No fake stories|no invented customers/);
  assert.match(landing, /Public methodology/);
  assert.doesNotMatch(landing, /Named case studies/);
  assert.doesNotMatch(landing, /Igor|Ganapolsky/i);

  // llms.txt points crawlers at the expertise hub and the public stats endpoint.
  assert.match(llms, /https:\/\/thumbgate\.app\/expertise/);
  assert.match(llms, /https:\/\/thumbgate\.app\/api\/expertise\/stats/);
  assert.match(llms, /Live public stats endpoint/);
  // Continuity is fenced VPS product truth (not Mac-pair marketing).
  assert.match(llms, /fenced cloud VPS runner|Fenced VPS/);
  assert.doesNotMatch(llms, /Igor|Ganapolsky/i);

  // Sitemap includes the new page.
  assert.match(sitemap, /https:\/\/thumbgate\.app\/expertise/);

  // The /expertise page shell is a server component with metadata.
  assert.match(expertisePage, /export const metadata/);
  assert.match(expertisePage, /Expertise/);
  assert.match(expertisePage, /ExpertiseClient/);

  // The client fetches from the public endpoint and includes the editorial checkpoints.
  assert.match(expertiseClient, /\/api\/expertise\/stats/);
  assert.match(expertiseClient, /methodology/);
  assert.match(expertiseClient, /Data source/);
  assert.match(expertiseClient, /Privacy boundary/);
  assert.match(expertiseClient, /Canary exclusion/);
  assert.match(expertiseClient, /\/api\/expertise\/stats/);
  assert.match(expertiseClient, /operator control-plane|control-plane counters/i);
  assert.doesNotMatch(expertiseClient, /Author:/);
  assert.doesNotMatch(expertiseClient, /cs\.author\.name/);
  assert.match(expertiseClient, /No stranger case studies|we do not invent customer stories/i);
  assert.doesNotMatch(expertiseClient, /still proving/);

  // The data library computes from D1 tables. No invented named-author case studies.
  assert.match(expertiseData, /caseStudies: \[\]/);
  assert.doesNotMatch(expertiseData, /Igor Ganapolsky/);
  assert.match(expertiseData, /methodology/);
  assert.match(expertiseData, /canaryExclusion/);
  assert.match(expertiseData, /tasks/i);
  assert.match(expertiseData, /devices/i);
  assert.match(expertiseData, /audit_events/i);

  // The API route returns the public telemetry shape with a 5-minute cache.
  assert.match(expertiseRoute, /collectExpertiseData\(\)/);
  assert.match(expertiseRoute, /max-age=300/);
  assert.match(expertiseRoute, /application\/json; charset=utf-8/);
});

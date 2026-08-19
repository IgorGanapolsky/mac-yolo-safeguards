import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("thumbgate.app/blog uses Cursor format for hosted Hermes", async () => {
  const [indexPage, postPage, posts, sitemap, landing, llms, rss] = await Promise.all([
    readFile(new URL("../app/blog/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/blog/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/blog/posts.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/llms.txt/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/blog/rss.xml/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(indexPage, /canonical: "\/blog"/);
  assert.match(indexPage, /min read/);
  assert.match(indexPage, /Not affiliated with Cursor/);
  assert.match(posts, /Give hosted Hermes a job/);
  assert.match(posts, /slug: "give-hosted-hermes-a-job"/);
  assert.match(posts, /author: "ThumbGate"/);
  assert.match(posts, /readMinutes: 5/);
  assert.match(posts, /topic: "product"/);
  assert.match(posts, /\$10\/month/);
  assert.match(postPage, /Give hosted Hermes a job/);
  assert.match(postPage, /data-cta-id="thumbgate-app-blog-20260819_home"/);
  assert.match(postPage, /data-funnel-event="hosted_checkout_click"/);
  assert.match(postPage, /"@type": "BlogPosting"/);
  assert.match(indexPage, /"@type": "Blog"/);
  assert.match(indexPage, /\/blog\/rss\.xml/);
  assert.match(rss, /thumbgate\.app\/blog\/\$\{post\.slug\}/);
  assert.match(rss, /application\/rss\+xml/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\/blog"/);
  assert.match(sitemap, /https:\/\/thumbgate\.app\/blog\/give-hosted-hermes-a-job"/);
  assert.match(landing, /href="\/blog">Blog</);
  assert.match(llms, /https:\/\/thumbgate\.app\/blog/);

  assert.doesNotMatch(posts, /\$499/);
  assert.doesNotMatch(posts, /Continuity/);
  assert.doesNotMatch(posts, /lid-close|when the Mac closes|Phone Leash/i);
  assert.doesNotMatch(posts, /1,800/);
  assert.doesNotMatch(posts, /Gmail, Slack, Notion/);
  assert.doesNotMatch(indexPage, /Igor|Ganapolsky/i);
  assert.doesNotMatch(postPage, /Igor|Ganapolsky/i);
  assert.doesNotMatch(rss, /Igor|Ganapolsky/i);
  assert.doesNotMatch(sitemap, /Igor|Ganapolsky/i);
  assert.doesNotMatch(postPage, /cloud_continuity_click/);
});

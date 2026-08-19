import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { BLOG_POSTS, postBodyText, sortedPosts } from "../lib/blog-posts.ts";
import {
  THUMBGATE_PUBLIC_COPY_CONTRACT,
  validateArtifact,
} from "../lib/output-quality-loop.ts";

const root = path.join(import.meta.dirname, "..");
const indexPage = fs.readFileSync(path.join(root, "app/blog/page.tsx"), "utf8");
const postPage = fs.readFileSync(path.join(root, "app/blog/[slug]/page.tsx"), "utf8");
const analyticsEvents = fs.readFileSync(
  path.join(root, "lib/analytics-events.ts"),
  "utf8",
);
const sitemapSource = fs.readFileSync(path.join(root, "app/sitemap.ts"), "utf8");
const llmsRoute = fs.readFileSync(path.join(root, "app/llms.txt/route.ts"), "utf8");

test("every blog post conforms to the public copy contract", () => {
  assert.ok(BLOG_POSTS.length >= 2, "at least two launch posts");
  for (const post of BLOG_POSTS) {
    const result = validateArtifact(THUMBGATE_PUBLIC_COPY_CONTRACT, postBodyText(post));
    assert.deepEqual(
      result.failedCriteria,
      [],
      `post ${post.slug} violates copy contract`,
    );
  }
});

test("post slugs are unique and kebab-case", () => {
  const slugs = BLOG_POSTS.map((post) => post.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  }
});

test("posts sort newest-first with valid ISO dates", () => {
  const posts = sortedPosts();
  for (const post of posts) {
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
  }
  const dates = posts.map((post) => post.publishedAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("blog CTA uses the allowlisted blog_cta_click funnel event", () => {
  assert.match(indexPage, /data-funnel-event="blog_cta_click"/);
  assert.match(postPage, /data-funnel-event="blog_cta_click"/);
  assert.match(analyticsEvents, /"blog_cta_click"/);
});

test("blog is discoverable: sitemap, llms.txt, RSS", () => {
  assert.match(sitemapSource, /thumbgate\.app\/blog/);
  assert.match(llmsRoute, /thumbgate\.app\/blog/);
  assert.ok(fs.existsSync(path.join(root, "app/blog/rss.xml/route.ts")));
});

test("blog pages keep the honest-marketing bans", () => {
  for (const source of [indexPage, postPage]) {
    assert.doesNotMatch(source, /<HostingSelector/);
    assert.doesNotMatch(source, /RUN ON/);
    assert.doesNotMatch(source, /Cloud vs Local/);
  }
});

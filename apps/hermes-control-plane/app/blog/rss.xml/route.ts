import { POSTS } from "../posts";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET() {
  const items = POSTS.map((post) => {
    const url = `https://thumbgate.app/blog/${post.slug}`;
    return [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${url}</link>`,
      `      <guid isPermaLink="true">${url}</guid>`,
      `      <pubDate>${new Date(`${post.date}T00:00:00.000Z`).toUTCString()}</pubDate>`,
      `      <description>${escapeXml(post.dek)}</description>`,
      "    </item>",
    ].join("\n");
  }).join("\n");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>ThumbGate.app — hosted Hermes</title>",
    "    <link>https://thumbgate.app/blog</link>",
    "    <description>Engineering notes for hosted Hermes on a fenced VPS. $10/month. Approvals in this browser.</description>",
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

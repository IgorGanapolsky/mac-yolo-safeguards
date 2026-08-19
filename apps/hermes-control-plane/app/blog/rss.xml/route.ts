import { sortedPosts } from "@/lib/blog-posts";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET() {
  const items = sortedPosts()
    .map((post) => {
      const url = `https://thumbgate.app/blog/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(`${post.publishedAt}T00:00:00.000Z`).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.description)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    "    <title>ThumbGate Blog</title>",
    "    <link>https://thumbgate.app/blog</link>",
    "    <description>Engineering notes and ideas on always-on, approval-gated agents.</description>",
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

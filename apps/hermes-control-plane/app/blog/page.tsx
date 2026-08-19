import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../BrandMark";
import { LOCKED_OFFER } from "@/lib/content-lane";
import { sortedPosts } from "@/lib/blog-posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Engineering notes and ideas from ThumbGate: keeping one always-on agent alive on a fenced VPS, with human approval gates on everything that matters.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: "https://thumbgate.app/blog",
    siteName: "ThumbGate",
    title: "ThumbGate Blog",
    description:
      "Engineering notes and ideas on always-on, approval-gated agents.",
  },
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function BlogIndex() {
  const posts = sortedPosts();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    url: "https://thumbgate.app/blog",
    name: "ThumbGate Blog",
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.publishedAt,
      url: `https://thumbgate.app/blog/${post.slug}`,
    })),
  };

  return (
    <main className="landing-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
      </nav>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Blog</p>
          <h1>Notes from the always-on lane.</h1>
          <p>
            How we keep one agent alive on a fenced VPS — and gated. Engineering
            mechanisms, product decisions, honest numbers only.
          </p>
        </div>
        <div className="steps-grid">
          {posts.map((post) => (
            <article key={post.slug}>
              <p className="eyebrow">
                {formatDate(post.publishedAt)} · {post.category} · {post.author} · {post.readMinutes} min read
              </p>
              <h3><Link href={`/blog/${post.slug}`}>{post.title}</Link></h3>
              <p>{post.description}</p>
              <p><Link href={`/blog/${post.slug}`}>Read the post →</Link></p>
            </article>
          ))}
        </div>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <a href="/api/auth/login" className="button button-primary" data-funnel-event="blog_cta_click" data-cta-id="thumbgate-app-blog-20260819_home">
            Start {LOCKED_OFFER.product} — {LOCKED_OFFER.price} <span aria-hidden="true">→</span>
          </a>
        </div>
        <p className="signin-note" style={{ marginTop: "16px" }}>
          Follow along: <a href="/blog/rss.xml">RSS feed</a>. {LOCKED_OFFER.product} runs on a {LOCKED_OFFER.host}; {LOCKED_OFFER.approvals}.
        </p>
      </section>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/blog">Blog</Link></p>
      </footer>
    </main>
  );
}

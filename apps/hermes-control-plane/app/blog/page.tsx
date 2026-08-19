import Link from "next/link";
import type { Metadata } from "next";
import { BrandMark } from "../BrandMark";
import { POSTS } from "./posts";
import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: "Blog — hosted Hermes on thumbgate.app",
  description:
    "Engineering notes for hosted Hermes on a fenced VPS. $10/month. Approvals in this browser.",
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
};

export default function BlogIndex() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    url: "https://thumbgate.app/blog",
    name: "ThumbGate.app Blog",
    description: "Engineering notes for hosted Hermes on a fenced VPS.",
    blogPost: POSTS.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      datePublished: post.date,
      author: { "@type": "Organization", name: post.author },
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
        <div className="nav-actions">
          <Link href="/#pricing" className="nav-link">Pricing</Link>
          <Link href="/blog" className="nav-link">Blog</Link>
        </div>
      </nav>
      <section id="main-content" className="section-block" tabIndex={-1}>
        <div className="section-heading">
          <p className="eyebrow">Blog</p>
          <h1>Notes on hosted Hermes.</h1>
          <p>Date, topic, author, read time — the Cursor blog format, on thumbgate.app. Not affiliated with Cursor. The product here is a $10 fenced VPS. <a href="/blog/rss.xml">RSS</a>.</p>
        </div>
        <div className={styles.cards}>
          {POSTS.map((post) => (
            <Link key={post.slug} className={styles.card} href={`/blog/${post.slug}`}>
              <p className={styles.meta}>{post.date} · {post.topic}</p>
              <h2>{post.title}</h2>
              <p>{post.dek}</p>
              <p className={styles.byline}>{post.author} · {post.readMinutes} min read →</p>
            </Link>
          ))}
        </div>
      </section>
      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/#pricing">Start hosted Hermes</Link></p>
      </footer>
    </main>
  );
}

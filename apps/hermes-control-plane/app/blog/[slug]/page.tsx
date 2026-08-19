import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "../../BrandMark";
import { LOCKED_OFFER } from "@/lib/content-lane";
import { BLOG_POSTS, getPost, offerClose } from "@/lib/blog-posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `https://thumbgate.app/blog/${post.slug}`,
      siteName: "ThumbGate",
      title: post.title,
      description: post.description,
      publishedTime: post.publishedAt,
      authors: [post.author],
    },
  };
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    author: { "@type": "Person", name: post.author },
    url: `https://thumbgate.app/blog/${post.slug}`,
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

      <article className="section-block">
        <div className="section-heading">
          <p className="eyebrow">
            <Link href="/blog">Blog</Link> · {formatDate(post.publishedAt)} · {post.category} · {post.readMinutes} min
          </p>
          <h1>{post.title}</h1>
          <p>{post.description}</p>
        </div>
        {post.sections.map((section, index) => (
          <section key={index} style={{ maxWidth: "70ch", margin: "0 auto" }}>
            {section.heading ? <h2 style={{ marginTop: "32px" }}>{section.heading}</h2> : null}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)} style={{ marginTop: "16px" }}>{paragraph}</p>
            ))}
          </section>
        ))}
        <p style={{ maxWidth: "70ch", margin: "24px auto 0" }}>{offerClose()}</p>
        <p style={{ maxWidth: "70ch", margin: "16px auto 0" }}>— {post.author}</p>
        <div className="hero-actions" style={{ marginTop: "32px" }}>
          <a href="/api/auth/login" className="button button-primary" data-funnel-event="blog_cta_click">
            Start {LOCKED_OFFER.product} — {LOCKED_OFFER.price} <span aria-hidden="true">→</span>
          </a>
        </div>
      </article>

      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/blog">Blog</Link></p>
      </footer>
    </main>
  );
}

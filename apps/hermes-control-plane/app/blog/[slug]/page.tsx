import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "../../BrandMark";
import { POSTS, postBySlug } from "../posts";
import styles from "../blog.module.css";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) return { title: "Blog" };
  return {
    title: `${post.title} — ThumbGate.app`,
    description: post.dek,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.dek,
      url: `https://thumbgate.app/blog/${post.slug}`,
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = postBySlug(slug);
  if (!post) notFound();
  const related = POSTS.filter((item) => item.slug !== post.slug).slice(0, 3);

  return (
    <main className="landing-shell">
      <nav className="topbar landing-nav" aria-label="Primary navigation">
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <div className="nav-actions">
          <Link href="/blog" className="nav-link">Blog</Link>
          <Link href="/#pricing" className="nav-link">Pricing</Link>
        </div>
      </nav>
      <article id="main-content" className={`section-block ${styles.article}`} tabIndex={-1}>
        <p className={styles.meta}>
          <Link href="/blog">Blog</Link>
          {" / "}
          {post.topic}
        </p>
        <p className={styles.meta}>{post.date} · {post.topic}</p>
        <h1>{post.title}</h1>
        <p className={styles.byline}>{post.author} · {post.readMinutes} min read</p>
        {post.sections.map((section) => (
          <section key={section.heading ?? section.paragraphs[0]?.slice(0, 24)}>
            {section.heading ? <h2>{section.heading}</h2> : null}
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 40)}>{paragraph}</p>
            ))}
          </section>
        ))}
        <div className={styles.ctaRow}>
          <a href="/api/auth/login" className="button button-primary" data-funnel-event="cloud_continuity_click" data-cta-id="thumbgate-app-blog-20260819_home">
            Give hosted Hermes a job
          </a>
        </div>
        {related.length > 0 ? (
          <div className={styles.related}>
            <h2>Related posts</h2>
            {related.map((item) => (
              <Link key={item.slug} href={`/blog/${item.slug}`}>{item.title}</Link>
            ))}
          </div>
        ) : null}
      </article>
      <footer>
        <Link href="/" className="brand"><BrandMark title="" /><span>ThumbGate <small>Hosted Hermes</small></span></Link>
        <p>Format stolen from cursor.com/blog. Not affiliated.</p>
      </footer>
    </main>
  );
}

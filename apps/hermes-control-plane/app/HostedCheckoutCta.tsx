import type { ReactNode } from "react";

type HostedCheckoutCtaProps = {
  className?: string;
  children: ReactNode;
  testId?: string;
  funnelEvent?: string;
  ctaId?: string;
};

/** One path: POST Stripe Checkout. Never an <a href> (GET → 405). */
export function HostedCheckoutCta({
  className = "button button-primary",
  children,
  testId,
  funnelEvent = "hosted_checkout_click",
  ctaId,
}: HostedCheckoutCtaProps) {
  return (
    <form action="/api/billing/checkout" method="POST" className="hero-cta-form">
      <button
        type="submit"
        className={className}
        data-funnel-event={funnelEvent}
        data-testid={testId}
        {...(ctaId ? { "data-cta-id": ctaId } : {})}
      >
        {children}
      </button>
    </form>
  );
}

import type { ReactNode } from "react";

type HostedCheckoutCtaProps = {
  className?: string;
  children: ReactNode;
  testId?: string;
};

/** One path: POST Stripe Checkout. Never an <a href> (GET → 405). */
export function HostedCheckoutCta({
  className = "button button-primary",
  children,
  testId,
}: HostedCheckoutCtaProps) {
  return (
    <form action="/api/billing/checkout" method="POST" className="hero-cta-form">
      <button
        type="submit"
        className={className}
        data-funnel-event="hosted_checkout_click"
        data-testid={testId}
      >
        {children}
      </button>
    </form>
  );
}

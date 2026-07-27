"use client";

import { useEffect, useState } from "react";

type Plan = {
  configured: true;
  active: true;
  unitAmount: number;
  currency: string;
  interval: string;
};

function formatAmount(plan: Plan): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.unitAmount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(plan.unitAmount / 100);
}

export function BillingPlan() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing/plan", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("plan unavailable");
        return response.json() as Promise<Plan>;
      })
      .then((nextPlan) => setPlan(nextPlan))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setUnavailable(true);
        }
      });
    return () => controller.abort();
  }, []);

  if (!plan) {
    return <strong aria-live="polite">{unavailable ? "See checkout" : "Live price"}</strong>;
  }

  return <strong aria-live="polite">{formatAmount(plan)}<small>/{plan.interval}</small></strong>;
}

"use client";

import { useState, type FormEvent, type ReactNode } from "react";

type SignOutFormProps = {
  className?: string;
  buttonClassName?: string;
  children?: ReactNode;
  /** Optional test id for e2e */
  "data-testid"?: string;
};

/**
 * One-click sign-out. Marks the control busy on first submit so a double-tap
 * cannot fire two navigations, and always uses type="submit".
 */
export function SignOutForm({
  className,
  buttonClassName,
  children = "Sign out",
  "data-testid": testId,
}: SignOutFormProps) {
  const [pending, setPending] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    setPending(true);
    // Native form POST continues → 303 home (or WorkOS fallback).
  }

  return (
    <form className={className} action="/api/auth/logout" method="post" onSubmit={onSubmit}>
      <button
        type="submit"
        className={buttonClassName}
        disabled={pending}
        aria-busy={pending}
        data-testid={testId}
      >
        {pending ? "Signing out…" : children}
      </button>
    </form>
  );
}

# AuthKit Social Sign-In: Decision-Grade Enablement Brief

- **Verdict on $10/mo cap**: Social login (Google, Apple, GitHub) costs **$0** under AuthKit's 1M-MAU free tier; the entire bill is $0 for a solo SaaS using only email + social, well under $10/mo. A custom AuthKit domain adds $99/mo and is the only line item that breaks the cap.
- **Free tier scope**: AuthKit explicitly bundles email + password, **social login**, passkeys, MFA, magic auth, and enterprise SSO under one 1M MAU free quota per the WorkOS pricing page.
- **Enterprise SSO is NOT free**: SAML/OIDC enterprise connections (Okta/Entra) run $125/connection/month at the 1-15 tier - a single enterprise customer can add $125/mo, but social providers do not.
- **Apple staging trap**: WorkOS ships default Apple credentials only for **staging**; production requires your own Apple Service ID, Team ID, private key (.p8), and Key ID.
- **Per-environment config**: Staging and production are fully isolated - API keys, OAuth connections, branding, and users do not carry over. Every dashboard action must be repeated on cutover.
- **Dashboard navigation**: Authentication -> OAuth providers (under the AuthKit section) is where every social provider is configured and toggled on/off.
- **Provider coverage**: WorkOS lists Google, Microsoft, GitHub, Apple, GitLab, LinkedIn, Slack, and Xero as social providers with first-class setup guides.
- **Regression signal**: The hosted AuthKit page renders buttons only for providers that are both configured AND enabled in the dashboard; missing config means a missing button, with no error fallback.
- **Mid-2026 product motion**: Step-up Authentication (Jul 2), Step-up AuthKit API, Widgets API (Jul 3), and AuthKit for Astro (Jul 7) added session re-verification and embeddable widgets - none changed which social providers are available, but Step-up is relevant for sensitive-action flows.
- **Apple hide-my-email caveat**: Apple users can hide their email; the dashboard must register outbound email domains with Apple Private Email Relay or those users lose transactional mail.
- **Custom domain = paid add-on**: The $99/mo Custom Domain line item is for the WorkOS auth hostname (e.g., auth.yourapp.com), not for the OAuth providers themselves.

## 1. Enabling Google, Apple, and GitHub on AuthKit (Production)

AuthKit's social login is configured in two dashboard steps per provider: (1) register OAuth credentials from the IdP, (2) enable the provider. Both happen in **Authentication -> OAuth providers** under the AuthKit section of the WorkOS Dashboard.

### Google
1. In Google Cloud Console, create (or select) a project, then **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID -> Web application**.
2. Add the **Authorized redirect URI** shown on the Google provider card in the WorkOS dashboard. The redirect URI is per-environment (staging vs production use different values).
3. Copy the Client ID and Client Secret into the WorkOS dashboard's Google provider card.
4. Toggle **Enable** on the same card.
5. (Optional) Configure the OAuth consent screen: app name, support email, scopes (default `openid email profile`), and - if you want external users without a test-mode gate - submit for Google verification once you have a production domain and privacy policy.

### Apple
1. In Apple Developer, **Certificates, Identifiers & Profiles -> Identifiers**, create (or reuse) an **App ID** with the **Sign in with Apple** capability checked.
2. Under **Identifiers -> Services IDs**, register a Services ID (reverse-DNS string, e.g., `com.yourapp.auth`). Enable **Sign in with Apple** on it and configure the **Return URL** with the redirect URI WorkOS shows.
3. Under **Keys**, create a new key with **Sign in with Apple** enabled, download the `.p8` file, and note the Key ID.
4. In the WorkOS dashboard's Apple provider card, paste: Team ID (top-right of Apple Developer membership page), Services ID, Key ID, and upload the `.p8`. Register any outbound email domains Apple should be allowed to relay to (covers users who pick "Hide My Email").
5. Toggle **Enable**.

Apple-specific gotchas: the Services ID identifier string must match exactly what you paste into WorkOS; the `.p8` is shown once and never re-downloadable; the primary App ID and Services ID are different artifacts even though both carry the capability flag.

### GitHub
1. GitHub -> **Settings -> Developer settings -> OAuth Apps -> New OAuth App** (or **GitHub Apps** if you prefer the device-flow model; WorkOS supports both).
2. **Homepage URL**: your app's production URL. **Authorization callback URL**: paste the redirect URI shown in the WorkOS GitHub provider card.
3. Create, then generate a client secret. Paste Client ID and generated secret into the WorkOS dashboard.
4. Enable the provider. (If you use a GitHub App instead, also generate a private key file and provide it.)

Production cutover checklist per provider: redirect URI matches the prod value exactly, OAuth client is in "production"/"live" (not "testing"), consent screen / scopes are finalized, and the dashboard toggle is on in the production environment (not just staging).

## 2. What Renders on the Hosted AuthKit Sign-In Page

WorkOS hosts the sign-in UI on its default domain; the dashboard lets you add a custom domain later (a separate $99/mo line item). On the hosted page, the provider list is dynamic - it reflects the union of providers that are **both configured and toggled enabled** in the current environment. Enable Google only and you see a Continue with Google button plus email/password. Add Apple and GitHub and they appear beneath. There is no "configured but hidden" state: either a configured-plus-enabled provider renders, or it does not appear at all.

The order WorkOS renders providers is fixed (Google, Microsoft, GitHub, Apple, GitLab, LinkedIn, Slack, Xero, per the docs). Customization is via the Branding settings (logo, colors, button radius, dark mode), not provider order.

Buttons only appear once the matching OAuth credentials are saved AND the Enable toggle is on. This is the most common cause of "the button vanished": credentials were saved in staging but the production environment's dashboard has none saved, or the toggle was off.

## 3. Cost Math: Solo SaaS Under $10/mo

| Line item | Cost | Notes |
|---|---|---|
| AuthKit (User Management), <1M MAUs | **$0** | "First 1M MAUs Free" per WorkOS pricing page |
| Social login providers (Google, Apple, GitHub) | **$0** | Bundled with AuthKit; OAuth connections are free |
| WorkOS SSO connections (SAML/OIDC for Okta/Entra) | **$125/connection/mo** at 1-15 tier | Not needed for social-only flows |
| Custom AuthKit domain | **$99/mo** | Optional; keeps you on `*.workos.com` if you skip |
| Radar (bot/fraud), Audit, FGA, etc. | Usage-priced | Off by default; not required for sign-in |

**Verdict:** A solo SaaS running email + Google + Apple + GitHub social only stays at **$0/mo** on WorkOS, comfortably inside the $10/mo cap. Adding a custom auth domain (`auth.yourapp.com`) is the first paid add-on - that single line pushes the bill to $99/mo and breaks the cap. If the founder's product can tolerate the default WorkOS-hosted sign-in URL, the entire social login stack remains free up to 1M MAUs. Adding even a single enterprise SSO connection for one B2B customer adds $125/mo, which is the more common cost-driver in practice than social providers.

## 4. Why Apple or GitHub Buttons Disappear After Staging-to-Production Cutover

The single most common cause: **staging and production are fully separate environments in WorkOS** - API keys, OAuth connections, users, webhook endpoints, and branding do not carry over. Any provider that was configured and enabled in the staging dashboard is invisible to the production environment until it is re-configured there.

Sub-causes, in approximate order of frequency:

1. **Provider only configured in staging.** The dashboard's OAuth providers list is per-environment. Production starts empty.
2. **Production Enable toggle still off.** Saving credentials does not auto-enable; you must toggle Enable.
3. **Apple-specific:** the `.p8` key was uploaded but Apple has revoked it, or the Services ID's Return URL was not updated to the production redirect URI shown on the production provider card (different from staging).
4. **Apple-specific:** outbound domains for Hide My Email were not registered in production, so Apple blocks the auth flow for users picking the relay option - this can look like a missing button.
5. **GitHub-specific:** the OAuth App's callback URL still points to the staging callback. GitHub rejects with an opaque error that, on the WorkOS side, surfaces as a button that briefly appears then fails - easy to misdiagnose as "missing."
6. **Wrong WorkOS API key in the app.** The staging publishable key works against the staging auth page; switching to the production key against a dashboard that has no configured providers renders an empty provider list.
7. **Branding/cache:** the hosted sign-in page is CDN-cached. After enabling in production, the cache can take a few minutes to refresh.

Mitigation: treat cutover as a checklist run, not a flag flip. Re-enter OAuth credentials (or copy via the WorkOS API where available), confirm Enable toggle on, swap API keys in the deployed app, and verify in an incognito window against the production auth URL.

## 5. Regression Testing the Provider List

Recommended signals, in priority order:

1. **HTML marker on each provider button.** WorkOS renders social buttons as anchors or buttons with stable test-ids - inspect the production sign-in page once and pin the selectors (e.g., `a[data-provider="google"]`, `[data-provider="apple"]`, `[data-provider="github"]`). A Playwright or Cypress test that asserts these three selectors exist after cutover catches the most common regression.
2. **Provider count assertion.** Beyond presence, assert the exact count of social buttons. Adding a new provider should be an explicit, reviewed change - a count delta in CI blocks accidental additions or removals.
3. **End-to-end happy path per provider.** A nightly Playwright job that, for each enabled provider, opens the sign-in page, clicks the provider button, completes consent on a fixture account, and asserts a redirect back to the app with a session cookie. This catches misconfigured redirect URIs and revoked keys that the static marker check misses.
4. **API-level config snapshot.** GET the WorkOS environment's provider configuration via API and snapshot it. Fail CI if the diff against the committed baseline is non-empty - this prevents dashboard drift between staging and prod.
5. **Dark-launch on staging.** Before flipping production, mirror the staging dashboard state to production via the WorkOS API or a documented runbook; run the e2e suite against production keys against the production auth URL.
6. **Button text/aria-label check.** Assert the human-readable label ("Continue with Google", "Continue with Apple", "Continue with GitHub") matches the approved copy in each locale; this catches WorkOS UI text changes that affect UX without affecting functionality.

For a solo founder, a 30-line Playwright spec covering items (1), (2), and (3) for the three providers is sufficient and runs in under a minute in CI.

## 6. Mid-2026 WorkOS Changes Affecting Social Providers

Scanning the WorkOS changelog from April through July 2026, no entries removed or renamed any of the social providers (Google, Apple, GitHub, Microsoft, GitLab, LinkedIn, Slack, Xero). The relevant additions in that window are orthogonal to social-login availability but matter for a production AuthKit rollout:

- **Step-up Authentication (Jul 2, 2026):** forces session re-verification before sensitive actions. Useful if your app later needs re-auth before, say, billing changes; not a social-provider change but worth noting.
- **Step-up AuthKit API, Widgets API (Jul 3, 2026):** a session-aware GraphQL API for building UI directly with WorkOS data, including a hosted sign-in widget. Could replace or complement the default AuthKit page in a future iteration.
- **AuthKit for Astro (Jul 7, 2026):** framework SDK addition. If your stack is Astro, this is the path of least resistance.
- **Projects and Branding per Environment (Jun 29, 2026):** confirms that branding (and by implication provider configuration) is per-environment. Reinforces the cutover discipline above.
- **Waitlist (Jun 26, 2026):** pre-launch signup gating - relevant if you're using AuthKit for invite-only beta access.

No deprecations, no pricing changes to the social tier, no provider removals. As of August 2026, the social provider roster is stable.

## Synthesis

Three actors, one decision tree. WorkOS AuthKit is the platform that bundles social login (Google, Apple, GitHub, Microsoft, GitLab, LinkedIn, Slack, Xero) inside a free 1M-MAU tier; Google Cloud, Apple Developer, and GitHub are the OAuth-app registrars where the founder must hold credentials; and the customer's browser is where the rendered provider list either matches or contradicts the dashboard config.

The divergence worth flagging: WorkOS prices **enterprise SSO connections** as a separate paid line ($125/mo each), while **social connections are free**. A founder reading "WorkOS charges per connection" can mistakenly budget for social logins the same way. The practical implication is that the cost model inverts between B2C-ish customers (free) and B2B enterprise customers ($125+ per IdP). A solo SaaS optimizing for social-only sign-in is structurally insulated from WorkOS's enterprise pricing tier until the first B2B deal arrives.

The mechanism behind "buttons vanish on cutover" is environmental isolation - staging and production are separate vaults. The implication is operational: any provider enablement is a two-step process (staging then production), and the regression test must target the production environment's auth URL with production API keys, not the staging URL with staging keys.

The recommendation for ThumbGate / hermes-control-plane: ship social-only (Google + Apple + GitHub) on the default WorkOS-hosted URL to stay at $0/mo; defer the custom auth domain until either branding requires it or the first enterprise SSO request lands; treat every dashboard toggle as a two-environment change with a Playwright assertion per environment.

## References

1. *Pricing - WorkOS*. https://workos.com/pricing
2. *http://workos.com/blog/clerk-pricing*. http://workos.com/blog/clerk-pricing
3. *Top 7 enterprise SSO providers for B2B SaaS apps in 2026 - WorkOS*. https://workos.com/blog/enterprise-sso-providers-b2b-saas
4. *WorkOS Alternatives for Enterprise Readiness in 2026 - Scalekit*. https://www.scalekit.com/blog/workos-alternatives
5. *Sessions – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/sessions
6. *GitHub - workos/authkit-tanstack-start: The WorkOS library for TanStack Start provides convenient helpers for authentication and session management using WorkOS & AuthKit with TanStack Start. · GitHub*. http://github.com/workos/authkit-tanstack-start
7. *workos.com*. https://workos.com/docs/integrations/apple.md
8. *workos/authkit-react*. http://github.com/workos/authkit-react
9. *workos/authkit - GitHub*. https://github.com/workos/authkit
10. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/users/introduction
11. *Example: custom login UI with WorkOS Node SDK*. https://github.com/workos/workos-custom-ui-authkit-example
12. *WorkOS — Your app, Enterprise Ready.*. http://workos.com/
13. *Get started with AuthKit - WorkOS*. https://workos.com/docs/authkit
14. *About the user authorization callback URL - GitHub Docs*. https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url
15. *OAuth apps | Developer Docs - developers.figma.com*. https://developers.figma.com/docs/rest-api/oauth-apps
16. *About the setup URL - GitHub Docs*. https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
17. *GitHub - Better Auth*. https://www.better-auth.com/docs/authentication/github
18. *Testing Authentication with Playwright: The Complete Guide<!-- --> | <!-- -->Apr 2026<!-- --> | Currents.dev Blog*. http://currents.dev/posts/testing-authentication-with-playwright-the-complete-guide
19. *Sign in with Apple | Apple Developer Documentation*. https://developer.apple.com/documentation/signinwithapple
20. *Sign in with Apple | Apple Developer Documentation*. https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
21. *Sign in to your developer account - Access - Account - Help ...*. https://developer.apple.com/help/account/access/sign-in-to-your-developer-account
22. *Apple Developer Program - Apple Developer*. https://developer.apple.com/programs
23. *Configure Sign in with Apple for the web*. https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web
24. *About creating GitHub Apps*. https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps
25. *Manage OAuth Clients - Google Cloud Platform Console Help*. https://support.google.com/cloud/answer/6158849
26. *AuthKit by WorkOS*. https://workos.com/authkit
27. *User Management — WorkOS*. https://workos.com/user-management
28. *Sign in with Apple JS | Apple Developer Documentation*. https://developer.apple.com/documentation/signinwithapplejs
29. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/domains
30. *Apple*. https://workos.com/docs/integrations/apple
31. *Changelog — WorkOS*. https://workos.com/changelog
32. *Redirecting to: /docs/authkit.md*. https://workos.com/docs/authkit/custom-domains
33. *Redirecting to: /docs/authkit.md*. https://workos.com/docs/user-management/custom-domain
34. *Social Login – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/social-login/google
35. *Social Login – AuthKit – WorkOS Docs*. https://workos.com/docs/user-management/social-login/google
36. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/customization
37. *workos/authkit-tanstack-start*. https://github.com/workos/authkit-tanstack-start
38. *AuthKit React SDK*. https://workos.com/docs/sdks/authkit-react
39. *AuthKit by WorkOS*. https://www.authkit.com/
40. *AuthKit TanStack Start SDK*. https://workos.com/docs/sdks/authkit-tanstack-start
41. *WorkOS - GitHub*. https://github.com/workos
42. *Staging vs. production environments – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/environments
43. *Social Login – AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/social-login
44. *Social login in React Router v7: Google, GitHub, and ...*. https://workos.com/blog/react-router-v7-social-login-guide
45. *@workos-inc/authkit-nextjs - AIKIDO-2026-309251*. http://intel.aikido.dev/cve/AIKIDO-2026-309251
46. *Branding*. https://workos.com/docs/authkit/branding
47. *authkit/README.md at main · workos/authkit · GitHub*. https://github.com/workos/authkit/blob/main/README.md
48. *Staging vs. production environments*. https://workos.com/docs/user-management/environments
49. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/users
50. *AuthKit – WorkOS Docs*. https://workos.com/docs/user-management/authentication
51. *Authorizing OAuth apps - GitHub Docs*. https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
52. *Github*. http://docs.teleskope.ai/connectors/saas/github
53. *WorkOS — Your app, Enterprise Ready.*. https://workos.com/
54. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/remix
55. *workos/authkit-nextjs: The WorkOS library for Next.js ...*. https://github.com/workos/authkit-nextjs
56. *Authentication API Domain – Custom Domains – WorkOS Docs*. https://workos.com/docs/custom-domains/auth-api
57. *Changelog — WorkOS*. http://workos.com/changelog
58. *Releases · workos/authkit-nextjs*. https://github.com/workos/authkit-nextjs/releases
59. *WorkOS vs Clerk*. http://workos.com/compare/clerk
60. *AuthKit Next.js SDK*. https://workos.com/docs/sdks/authkit-nextjs
61. *AuthKit – WorkOS Docs*. https://workos.com/docs/authkit/nextjs

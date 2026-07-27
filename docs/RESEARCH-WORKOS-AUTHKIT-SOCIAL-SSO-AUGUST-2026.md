# RESEARCH — WorkOS AuthKit social SSO (Google / Apple / GitHub)

**Run ID:** `trun_c952ecf15ab54779b1e7111424a2943a`  
**Interaction ID:** same (use as `--previous-interaction-id` for follow-ups)  
**Date:** 2026-07-23 (research framed for August 2026 product state)  
**Raw:** `parallel-research/workos-authkit-social-sso-august-2026.md` (+ `.json`)

## Verdict

| Question | Answer |
|----------|--------|
| Can Production show Google + Apple + GitHub? | **Yes** — configure + enable each under AuthKit OAuth providers |
| Does social SSO break the **$10/mo** WorkOS cap? | **No** — social OAuth is **$0** under AuthKit free tier (1M MAU); **custom AuthKit domain ($99)** and **enterprise SAML connections ($125/conn)** break the cap |
| Why only Email + Google on ThumbGate today? | Production only fully wired those methods; staging samples do not transfer |

## Action checklist (ThumbGate)

1. **WorkOS Dashboard → Production → Authentication → OAuth providers**  
   - Confirm Google enabled (already).  
   - Add **GitHub** (own OAuth App + WorkOS redirect URI + Enable).  
   - Add **Apple** (Services ID, Team ID, Key ID, `.p8`, production Return URL + Enable).  
2. **Do not** buy custom AuthKit domain under current cap.  
3. **Do not** add enterprise SSO connections without budget rewrite.  
4. Update `EXPECTED_METHODS` in `tools/workos-production-guard.js` the same day (e.g. add `continue with github` / `continue with apple`).  
5. Align landing copy to only claim enabled methods.  
6. After enable: hard-refresh AuthKit incognito; run `node tools/workos-production-guard.js`.

## Staging cutover traps (why buttons “disappear”)

- Staging and Production are **isolated** (credentials do not carry over).  
- Apple: staging may ship defaults; **production requires your own Apple credentials**.  
- Enable toggle must be on after saving secrets.  
- Redirect URIs must be the **production** WorkOS values.

## Related

- `docs/WORKOS-PRODUCTION-SPEND-CAP.md`  
- `tools/workos-production-guard.js`  
- Live AuthKit host: `progressive-mouse-13.authkit.app`

## Update — 2026-07-24

Re-checked WorkOS's current pricing page (`workos.com/pricing.md`) and general 2026 pricing coverage against every dollar figure in this doc, plus re-read `docs/WORKOS-PRODUCTION-SPEND-CAP.md` and `tools/workos-production-guard.js` for codebase drift since yesterday.

**Nothing has changed. The verdict stands exactly as written:**

- AuthKit free tier: confirmed free to 1M MAU, and that free tier explicitly includes email+password, social login (Google/GitHub/Microsoft/etc.), passkeys, MFA, and magic auth — social OAuth is $0, matching the doc's verdict precisely.
- Custom AuthKit domain: confirmed **$99/mo** — still the thing to never enable under the $10/mo cap.
- Enterprise SSO/SAML connections: confirmed **$125/connection** for the first 15 (tiering down to $50 at higher volume), and Directory Sync/SCIM is billed on the identical per-connection ladder — still the other thing to never enable.
- No pricing restructuring, no change to what's bundled free vs. paid, no new AuthKit tier announced since 2026-07-23.
- One thing this doc doesn't mention (not a correction, an addition worth knowing): WorkOS also sells **Radar** (bot/fraud protection — first 1,000 checks/mo free, then ~$100/mo per 50K checks) and **Audit Logs** (~$99/mo per 1M events, ~$125/mo per SIEM connection). Neither is relevant to the social-SSO question this doc answers, but both are toggles on the same WorkOS Dashboard and worth a mental note not to fat-finger on while in there enabling Google/Apple/GitHub.

**Codebase check — still exactly as the doc describes:**
- `tools/workos-production-guard.js`'s `EXPECTED_METHODS` is still `[email, google]` only — GitHub and Apple have not been added since this doc was written.
- `docs/WORKOS-PRODUCTION-SPEND-CAP.md` is unchanged (same production client ID, same AuthKit host `progressive-mouse-13.authkit.app`, same $10/mo policy, same forbidden list).
- No new commits touch either file since the guard/cutover work landed (`60811459`, `2987b829`); both research docs themselves are untracked/new, confirming no prior version to diverge from.

No open questions remain unanswered on the pricing side. The only real next step is still the action checklist above (add GitHub and Apple providers in the WorkOS Dashboard, then update `EXPECTED_METHODS` the same day) — that step was never blocked on anything changing; it's just not done yet.

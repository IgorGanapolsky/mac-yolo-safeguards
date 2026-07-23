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

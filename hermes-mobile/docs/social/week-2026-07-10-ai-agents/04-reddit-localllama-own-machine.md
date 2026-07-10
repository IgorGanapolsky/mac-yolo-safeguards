# Reddit r/LocalLLaMA — own-machine economics

**Status:** Draft — manual post (value-first, no spam)  
**Suggested title:** [Tool] Mobile approve/deny for agents running on your own Mac (not cloud credits)

---

I run local agents on a Mac mini and got tired of two failure modes:

1. **Cloud agents** — credit burn while the agent loops  
2. **Phone AI apps** — great for chat, useless when you need to approve `git push --force` on your desktop agent

Built **Hermes Mobile** as a remote operator UI: chat + one-tap approve/deny for blocked tool calls. Pairs over QR; keys stay on your machine. Free tier covers chat + approvals; Leash Pro ($19.99/mo) adds standing gate rules.

Not trying to replace Ollama or your local stack — it's the phone remote for what's already running.

Happy to answer setup questions. Gateway repo: github.com/IgorGanapolsky/mac-yolo-safeguards

Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile

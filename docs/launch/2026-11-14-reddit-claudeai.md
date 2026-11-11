Subreddit: r/ClaudeAI
Flair: Built with Claude
Title: I built a free menu bar app with Claude Code that keeps long agent sessions from freezing my Mac

I run Claude Code for hours at a time, often several sessions at once, and every few days my MacBook would grind to a halt. Swap kept climbing, logs under /private/tmp filled the disk, and MCP server processes kept running after the sessions that started them had ended.

So I built Mac YOLO Safeguards, a small menu bar app for Apple Silicon Macs. It shows CPU, memory, swap and disk with the process behind each one. It stops MCP servers and helper processes whose agent is gone, without touching tmux or the app you're using. One click cleans agent logs, old simulator runtimes and developer caches. It also includes an MCP server, so Claude Code can check the Mac's health before starting heavy work.

How Claude helped: Claude Code wrote most of the code, the Swift menu bar app and the Node tools behind it, while I reviewed and steered. It also ran the release work I usually put off, like signing, Apple notarization and checking that every download passes Gatekeeper. My favorite example was this week. The app showed 100% CPU after a reboot, and I asked Claude Code why it wasn't fixing it. It worked out that Spotlight was re-indexing and that the app was reading the load average, which overstates CPU on Apple Silicon. It then switched the app to the kernel's CPU counters and opened the pull request.

It's free to try and MIT licensed. There's an optional paid tier for people who want to support it, but the app itself is complete. Site: https://macyolosafeguards.io/ and source: https://github.com/IgorGanapolsky/mac-yolo-safeguards

I'd like to hear what else slows your Mac down during long Claude Code sessions.

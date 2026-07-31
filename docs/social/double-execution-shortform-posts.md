# Shortform Social Media Distribution Pack (Campaign: double-execution-lease-v1)

---

## 1. LinkedIn Post Draft

**Hook:**
> I built approval gates for autonomous coding agents.
> 
> Most agent tools now ask permission before running a dangerous command. But that doesn't answer the harder question: **who finishes the job when your laptop lid closes?**
> 
> Failover for a stateful agent run is a distributed systems problem, not a UI problem.
> 
> If your Mac sleeps mid-run and a cloud node takes over without strict lease guarantees, two executors end up writing to the same thread—causing double migrations, conflicting commits, or broken builds.
> 
> We solved this with a **90-second renewable resource lease**:
> 1. Exactly ONE machine holds execution rights at any millisecond.
> 2. Primary executor must heartbeat renew every 30s.
> 3. If lease expires, execution on the primary node fails closed before secondary continuity takes over.

**First Comment Links:**
- Google Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&utm_source=linkedin&utm_medium=post&utm_campaign=double_execution_lease
- Web Continuity: https://thumbgate.app?utm_source=linkedin&utm_medium=post&utm_campaign=double_execution_lease
- GitHub Repository: https://github.com/IgorGanapolsky/mac-yolo-safeguards

---

## 2. X (Twitter) Post Draft

> Failover for a stateful AI coding agent is a lease problem, not a UI problem.
>
> Two executors on one thread is strictly worse than zero executors.
>
> Here is how a 90-second renewable lease prevents double-execution when your Mac sleeps:
> https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&utm_source=x&utm_medium=post&utm_campaign=double_execution_lease

---

## 3. Bluesky Post Draft

> Every agent tool now has an approval dialog.
>
> None of them answer the harder question: who finishes the job when your laptop lid closes?
>
> Two executors on one thread is worse than zero. Our 90-second lease guarantees 1-executor failover:
> https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&utm_source=bluesky&utm_medium=post&utm_campaign=double_execution_lease

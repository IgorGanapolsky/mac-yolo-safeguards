import { currentSession, workosConfigured } from "@/lib/auth";
import { hasCloudContinuationAccess } from "@/lib/entitlements";

export async function GET() {
  const session = await currentSession();
  // Always 200 for landing chrome (avoids noisy 401 in console). Cache never.
  if (!session) {
    return Response.json(
      { authenticated: false, workosConfigured: workosConfigured() },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      authenticated: true,
      user: { id: session.userId, email: session.email, name: session.name, avatarUrl: session.avatarUrl },
      organization: {
        id: session.organizationId,
        plan: session.plan,
        trialEndsAt: session.trialEndsAt,
        cloudAccess: hasCloudContinuationAccess(session),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

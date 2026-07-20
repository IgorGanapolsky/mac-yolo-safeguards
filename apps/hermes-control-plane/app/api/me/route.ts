import { currentSession, workosConfigured } from "@/lib/auth";

export async function GET() {
  const session = await currentSession();
  if (!session) return Response.json({ authenticated: false, workosConfigured: workosConfigured() }, { status: 401 });
  return Response.json({
    authenticated: true,
    user: { id: session.userId, email: session.email, name: session.name, avatarUrl: session.avatarUrl },
    organization: { id: session.organizationId, plan: session.plan },
  });
}

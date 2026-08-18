export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/api/auth/login?return_to=/dashboard" },
  });
}

export const HEAD = GET;

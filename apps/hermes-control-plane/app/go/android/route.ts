export function GET() {
  return new Response(null, {
    status: 301,
    headers: { Location: "/" },
  });
}

export const HEAD = GET;

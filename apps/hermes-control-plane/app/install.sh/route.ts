const SOURCE_URL = "https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh";

export async function GET() {
  const upstream = await fetch(SOURCE_URL, { cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.ok ? 200 : 502,
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

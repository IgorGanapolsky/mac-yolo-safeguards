import { PLAY_STORE_URL } from "@/app/storeLinks";

export async function GET() {
  return Response.redirect(PLAY_STORE_URL, 302);
}

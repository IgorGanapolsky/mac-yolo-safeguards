import { APP_STORE_URL } from "@/app/storeLinks";

export async function GET() {
  return Response.redirect(APP_STORE_URL, 302);
}

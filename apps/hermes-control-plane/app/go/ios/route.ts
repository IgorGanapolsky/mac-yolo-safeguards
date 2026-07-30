import { APP_STORE_URL } from "@/app/storeLinks";
import {
  recordStoreRedirect,
  storeRedirectResponse,
} from "@/lib/store-attribution";

export async function GET(request: Request) {
  await recordStoreRedirect(request, "app_store_click");
  return storeRedirectResponse(APP_STORE_URL);
}

import { PLAY_STORE_URL } from "@/app/storeLinks";
import {
  buildPlayStoreUrl,
  recordStoreRedirect,
  storeRedirectResponse,
} from "@/lib/store-attribution";

export async function GET(request: Request) {
  const receipt = await recordStoreRedirect(request, "play_store_click");
  return storeRedirectResponse(
    buildPlayStoreUrl(PLAY_STORE_URL, receipt.attribution),
  );
}

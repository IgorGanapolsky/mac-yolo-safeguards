import { NextResponse } from "next/server";

const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid";

/**
 * Keeps the raw package id (which embeds a personal name) out of the public
 * marketing page source; the redirect target lives server-side only.
 */
export function GET() {
  return NextResponse.redirect(PLAY_STORE_URL);
}

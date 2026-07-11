/** One-shot intents for store screenshot automation (release-safe smoke preview + QR pair). */

let openPairQrOnSettingsFocus = false;

export function requestSettingsPairQrOnFocus(): void {
  openPairQrOnSettingsFocus = true;
}

export function consumeSettingsPairQrOnFocus(): boolean {
  const open = openPairQrOnSettingsFocus;
  openPairQrOnSettingsFocus = false;
  return open;
}

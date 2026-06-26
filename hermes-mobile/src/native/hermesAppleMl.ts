import { NativeModules, Platform } from 'react-native';
import { buildApprovalSummaryPrompt } from '../utils/approvalSummaryPrompt';

type HermesAppleMlNative = {
  summarizeApprovalDiff: (diff: string, toolName?: string) => Promise<string>;
  extractTextFromImage: (base64: string) => Promise<string>;
};

const Native: HermesAppleMlNative | undefined =
  Platform.OS === 'ios' ? NativeModules.HermesAppleMl : undefined;

/** On-device Foundation Models summary when native module is linked; else prompt preview. */
export async function summarizeApprovalDiff(
  diff: string,
  toolName?: string,
): Promise<string> {
  if (Native?.summarizeApprovalDiff) {
    try {
      return await Native.summarizeApprovalDiff(diff, toolName);
    } catch {
      // fall through to RN fallback
    }
  }
  const prompt = buildApprovalSummaryPrompt(diff, toolName);
  return `Summary unavailable (link HermesAppleMl in Xcode). Prompt chars: ${prompt.length}`;
}

export async function extractTextFromApprovalScreenshot(base64: string): Promise<string> {
  if (!Native?.extractTextFromImage) return '';
  try {
    return await Native.extractTextFromImage(base64);
  } catch {
    return '';
  }
}

export function isAppleMlNativeAvailable(): boolean {
  return Platform.OS === 'ios' && Boolean(Native?.summarizeApprovalDiff);
}

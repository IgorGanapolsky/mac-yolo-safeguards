export type RunNotificationContext = {
  projectName?: string;
  computerName?: string;
  promptSnippet?: string;
};

let activeContext: RunNotificationContext | null = null;
let chatScreenForegroundFocused = false;

export function setChatScreenForegroundFocused(focused: boolean): void {
  chatScreenForegroundFocused = focused;
}

export function isChatScreenForegroundFocused(): boolean {
  return chatScreenForegroundFocused;
}

export function setRunNotificationContext(context: RunNotificationContext): void {
  activeContext = {
    projectName: context.projectName?.trim() || undefined,
    computerName: context.computerName?.trim() || undefined,
    promptSnippet: context.promptSnippet?.trim() || undefined,
  };
}

export function getRunNotificationContext(): RunNotificationContext | null {
  return activeContext;
}

export function clearRunNotificationContext(): void {
  activeContext = null;
}

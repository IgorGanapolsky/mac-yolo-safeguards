import { expect, test } from "@playwright/test";

const RELAY_URL = "http://127.0.0.1:44174";
const RELAY_TOKEN = "browser-e2e-relay-token";

async function appendFromPhone(request, threadId, body) {
  return request.post(`${RELAY_URL}/v1/threads/${threadId}/events`, {
    headers: { authorization: `Bearer ${RELAY_TOKEN}` },
    data: body,
  });
}

test("authenticated web session searches, continues, live-syncs, reloads, and deletes a phone thread", async ({ page, request, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
  await page.getByLabel("Web access code").fill("wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("invalid_access_code");

  await page.getByLabel("Web access code").fill("browser-e2e-access");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Skool buyers" })).toBeVisible();
  await expect(page.getByText("Find qualified Skool buyers")).toBeVisible();

  await page.getByPlaceholder("Search threads").fill("skool");
  await expect(page.getByRole("button", { name: /Skool buyers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Revenue research/ })).toBeHidden();
  await page.getByPlaceholder("Search threads").fill("missing session");
  await expect(page.getByText("No threads match “missing session”.")).toBeVisible();
  await page.getByPlaceholder("Search threads").fill("");

  await page.getByRole("button", { name: /Revenue research/ }).click();
  await page.getByPlaceholder("Message Hermes").fill("continue from the browser");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("continue from the browser")).toBeVisible();
  await page.reload();
  await expect(page.getByText("continue from the browser")).toBeVisible();

  const liveMutation = {
    mutation_id: "phone_live_sync",
    author_device_id: "phone_e2e",
    kind: "assistant_message",
    payload: { message_id: "phone_live_message", text: "live update from phone" },
  };
  expect((await appendFromPhone(request, "revenue_thread", liveMutation)).ok()).toBeTruthy();
  await expect(page.getByText("live update from phone")).toBeVisible({ timeout: 8_000 });

  const browserSurface = `${await page.content()} ${await (await request.get("/app.js")).text()}`;
  expect(browserSurface).not.toContain(RELAY_TOKEN);
  const cookies = await context.cookies();
  expect(cookies.find(({ name }) => name === "hermes_session")?.httpOnly).toBeTruthy();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Revenue research")).toBeHidden();
});

import asyncio
from playwright.async_api import Page, expect, async_playwright
import os

async def playwright_login(page: Page, email: str, password: str, storage_state_path: str):
    """
    Performs login to Skool.com and saves the browser storage state.
    """
    print("Navigating to Skool login page...")
    await page.goto("https://www.skool.com/login", wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_timeout(5000) # Give some time for rendering
    await page.screenshot(path="skool_login_render_check.png") # Screenshot before locator attempt
    print(f"Current URL after goto: {page.url}")


    print(f"Entering email: {email}")
    await page.wait_for_selector('input[placeholder="Email"]', state='visible', timeout=20000)
    await page.locator('input[placeholder="Email"]').fill(email, force=True)

    print("Entering password...")
    await page.wait_for_selector('input[placeholder="Password"]', state='visible', timeout=20000)
    await page.locator('input[placeholder="Password"]').fill(password, force=True)

    print("Clicking login button...")
    await page.locator('button[type="submit"]').click()

    print("Waiting for dashboard or successful navigation...")
    # Wait for URL change or an element on the dashboard to appear
    try:
        # Adjusted to expect navigation to /community/* or /dashboard/* after login
        await page.wait_for_url("https://www.skool.com/(community|dashboard)/*", timeout=30000, wait_until='networkidle')
        print("Successfully navigated to dashboard/community URL.")
    except Exception as e:
        print(f"Login navigation timed out or failed to reach dashboard URL: {e}")
        # Fallback to waiting for a common dashboard element if URL navigation isn't instant or predictable
        try:
            await expect(page.locator("text=Dashboard").or_(page.locator("text=Home"))).to_be_visible(timeout=30000)
            print("Dashboard element found.")
        except Exception as inner_e:
            print(f"Could not find dashboard element either: {inner_e}")
            raise inner_e # Re-raise if dashboard element isn't found either


    print(f"Login successful. Saving storage state to {storage_state_path}...")
    await page.context.storage_state(path=storage_state_path)
    print("Storage state saved.")

async def main():
    email = os.environ.get("SKOOL_EMAIL")
    password = os.environ.get("SKOOL_PASSWORD")
    storage_state_path = os.environ.get("SKOOL_STORAGE_STATE_PATH", "playwright_state.json")

    if not email or not password:
        print("SKOOL_EMAIL and SKOOL_PASSWORD environment variables must be set.")
        exit(1)

    # Ensure the directory for storage state exists
    os.makedirs(os.path.dirname(storage_state_path) or '.', exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False) # Set headless=False to see the browser UI
        page = await browser.new_page()
        try:
            await playwright_login(page, email, password, storage_state_path)
        except Exception as e:
            print("Login failed. Attempting to take screenshot...")
            screenshot_path = "skool_login_fatal_error.png"
            try:
                await page.screenshot(path=screenshot_path)
                print(f"Screenshot saved to {screenshot_path}")
            except Exception as screenshot_e:
                print(f"Could not save screenshot: {screenshot_e}")
            print(f"Error during login: {e}")
            raise e
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

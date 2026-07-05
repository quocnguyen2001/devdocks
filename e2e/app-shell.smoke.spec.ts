import { test, expect } from "@playwright/test";

// React-layer smoke: the app shell mounts and navigation to the editor works
// without a Tauri backend (IPC calls fail and are handled gracefully).
test("renders the app shell and opens the workspace editor", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("DevDock")).toBeVisible();
  const newButton = page.getByRole("button", { name: /new workspace/i }).first();
  await expect(newButton).toBeVisible();

  await newButton.click();
  await expect(
    page.getByRole("heading", { name: /new workspace/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Name")).toBeVisible();
});

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("login accessibility", () => {
  test("login page has no serious axe violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious"
    );

    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("login page exposes primary sign-in control", async ({ page }) => {
    await page.goto("/login");

    const signIn = page.getByRole("button", { name: /sign in with microsoft/i });
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeEnabled();
  });
});

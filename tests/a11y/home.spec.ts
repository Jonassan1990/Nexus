import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("portal provides a keyboard skip link and has no critical accessibility violations", async ({
  page
}) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();

  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const results = await new AxeBuilder({ page }).include("#main-content").analyze();
  const criticalViolations = results.violations.filter((violation) => violation.impact === "critical");

  expect(criticalViolations).toEqual([]);
});

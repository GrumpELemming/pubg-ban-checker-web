const { test, expect } = require("@playwright/test");

async function openCrates(page, bp = 10000, gc = 40) {
  await page.addInitScript(({ bp, gc }) => {
    localStorage.setItem("red13_bp", String(bp));
    localStorage.setItem("red13_gc", String(gc));
  }, { bp, gc });
  await page.goto("/red13/index.html");
  await page.locator(".press-enter").click();
  await page.locator("#btnCrates").click();
}

test("both crates open visibly, charge once and allow another purchase", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openCrates(page);
  await page.locator("#buyWeapon").click();
  await expect(page.locator("#buyWeapon")).toBeDisabled();
  await page.locator("#buyWeapon").evaluate(button => button.dispatchEvent(new MouseEvent("click")));
  await expect(page.locator("#crateStatus")).toHaveText("Crate opened.");
  await expect(page.locator("#crHudGC")).toHaveText("20");
  await expect(page.locator("#crateImg")).toBeInViewport();
  await expect(page.locator("#crateItemLabel")).not.toBeEmpty();
  await expect(page.locator("#crateItemLabel")).toBeInViewport();
  await expect(page.locator("#rewardCard")).toHaveClass(/show/);
  await page.locator("#buyOutfit").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#crateStatus")).toHaveText("Crate opened.");
  await expect(page.locator("#crHudBP")).toHaveText("5,000");
  await expect(page.locator("#crateImg")).toHaveAttribute("src", "assets/clothescrate.png");
  expect(await page.evaluate(() => localStorage.getItem("red13_gc"))).toBe("20");
  expect(errors).toEqual([]);
});

test("insufficient funds do not charge or open a crate", async ({ page }) => {
  await openCrates(page, 1, 1);
  await page.locator("#buyWeapon").click();
  await expect(page.locator("#crateStatus")).toContainText("Not enough GCoin");
  await page.locator("#buyOutfit").click();
  await expect(page.locator("#crateStatus")).toContainText("Not enough BP");
  expect(await page.evaluate(() => localStorage.getItem("red13_gc"))).toBe("1");
  expect(await page.evaluate(() => localStorage.getItem("red13_bp"))).toBe("1");
  await expect(page.locator("#rewardCard")).not.toHaveClass(/show/);
});

test("leaving during an opening cancels its reveal and permits reopening", async ({ page }) => {
  await openCrates(page);
  await page.locator("#buyWeapon").click();
  await page.locator("#btnBackOps").click();
  await page.waitForTimeout(1100);
  await page.locator("#btnCrates").click();
  await expect(page.locator("#crateStatus")).toBeEmpty();
  await expect(page.locator("#rewardCard")).not.toHaveClass(/show/);
  await expect(page.locator("#buyWeapon")).toBeEnabled();
  await page.locator("#buyWeapon").click();
  await expect(page.locator("#crateStatus")).toHaveText("Crate opened.");
  await expect(page.locator("#crHudGC")).toHaveText("0");
});

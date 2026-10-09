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
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("red13_inventory")).length)).toBe(2);
});

test("inventory persists crate items and scraps each for its correct BP value", async ({ page }) => {
  await openCrates(page);
  await page.locator("#buyWeapon").click();
  await expect(page.locator("#crateStatus")).toHaveText("Crate opened.");
  await page.locator("#buyOutfit").click();
  await expect(page.locator("#crateStatus")).toHaveText("Crate opened.");
  await expect(page.locator("#inventoryCount")).toHaveText("2");
  await page.reload();
  await page.locator(".press-enter").click();
  await page.locator("#btnCrates").click();
  await page.locator("#crateInventory summary").click();
  await expect(page.locator("#inventoryItems li")).toHaveCount(2);
  await page.getByRole("button", { name: /Scrap .* for 500 BP/ }).click();
  await expect(page.locator("#crHudBP")).toHaveText("10,500");
  await expect(page.locator("#inventoryCount")).toHaveText("1");
  await page.getByRole("button", { name: /Scrap .* for 1,500 BP/ }).evaluate(button => { button.click(); button.click(); });
  await expect(page.locator("#crHudBP")).toHaveText("12,000");
  await expect(page.locator("#inventoryCount")).toHaveText("0");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("red13_inventory")))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("red13_gc"))).toBe("40");
});

test("failed inventory writes restore currency and do not create items", async ({ page }) => {
  await openCrates(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "red13_inventory") throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#buyWeapon").click();
  await expect(page.locator("#crateStatus")).toContainText("Could not save the item");
  expect(await page.evaluate(() => localStorage.getItem("red13_gc"))).toBe("40");
  await expect(page.locator("#inventoryCount")).toHaveText("0");
});

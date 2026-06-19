import { test, expect } from "@playwright/test";

const ALICE_EMAIL = process.env.E2E_ALICE ?? "alice@example.com";
const ALICE_PASS = process.env.E2E_ALICE_PASS ?? "AlicePass123!";
const BOB_EMAIL = process.env.E2E_BOB ?? "bob@example.com";
const BOB_PASS = process.env.E2E_BOB_PASS ?? "BobPass123!";

test.describe("Webmail E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("Alice can sign in and see inbox", async ({ page }) => {
    await page.getByTestId("login-email").fill(ALICE_EMAIL);
    await page.getByTestId("login-password").fill(ALICE_PASS);
    await page.getByTestId("login-submit").click();

    await expect(page.getByTestId("nav-inbox")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("compose-btn")).toBeVisible();
  });

  test("Alice can compose and send mail to Bob", async ({ page }) => {
    await page.getByTestId("login-email").fill(ALICE_EMAIL);
    await page.getByTestId("login-password").fill(ALICE_PASS);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("compose-btn")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("compose-btn").click();
    await expect(page.getByTestId("compose-form")).toBeVisible();

    const subject = `E2E test ${Date.now()}`;
    await page.getByTestId("compose-to").fill(BOB_EMAIL);
    await page.getByTestId("compose-subject").fill(subject);
    await page.getByTestId("compose-body").fill("Hello Bob, this is an automated E2E test.");
    await page.getByTestId("compose-send").click();

    await expect(page.getByTestId("send-notice")).toHaveText("Message sent", { timeout: 15_000 });
  });

  test("Bob receives mail sent by Alice", async ({ page }) => {
    const subject = `E2E receive ${Date.now()}`;

    // Alice sends
    await page.getByTestId("login-email").fill(ALICE_EMAIL);
    await page.getByTestId("login-password").fill(ALICE_PASS);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("compose-btn")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("compose-btn").click();
    await page.getByTestId("compose-to").fill(BOB_EMAIL);
    await page.getByTestId("compose-subject").fill(subject);
    await page.getByTestId("compose-body").fill("Delivery test from Alice to Bob.");
    await page.getByTestId("compose-send").click();
    await expect(page.getByTestId("send-notice")).toHaveText("Message sent", { timeout: 15_000 });

    // Bob signs in
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByTestId("login-form")).toBeVisible();

    await page.getByTestId("login-email").fill(BOB_EMAIL);
    await page.getByTestId("login-password").fill(BOB_PASS);
    await page.getByTestId("login-submit").click();
    await expect(page.getByTestId("nav-inbox")).toBeVisible({ timeout: 15_000 });

    // Wait for delivery and refresh inbox
    await expect(async () => {
      await page.getByTestId("nav-inbox").click();
      await expect(page.getByTestId("mail-row").filter({ hasText: subject })).toBeVisible();
    }).toPass({ timeout: 30_000 });
  });
});

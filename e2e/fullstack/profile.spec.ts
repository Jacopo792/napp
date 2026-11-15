import { test, expect, login, openSettings } from "./fixture.ts";

test("a window holding an old profile cannot switch archived privacy back off", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("profile");
  await login(page, account);
  await openSettings(page);
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Keep archived notes private" })).not.toBeChecked();

  // Another device switches it on while this window still shows it off.
  const turnedOn = await account.client
    .from("profiles")
    .update({ hide_archived: true })
    .eq("user_id", account.id);
  expect(turnedOn.error).toBeNull();

  await page.getByRole("button", { name: "Profile", exact: true }).click();
  const nickname = page.getByRole("textbox", { name: "Nickname", exact: true });
  await nickname.fill("Renamed here");
  await nickname.press("Enter");

  await expect
    .poll(async () => {
      const row = await account.client
        .from("profiles")
        .select("nickname, hide_archived")
        .eq("user_id", account.id)
        .single();
      return row.data;
    })
    .toEqual({ nickname: "Renamed here", hide_archived: true });
});

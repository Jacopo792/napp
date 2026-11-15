import assert from "node:assert/strict";
import test from "node:test";
import {
  LIST_MAX,
  LIST_MIN,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  paneWidths,
  panesToHide,
} from "./paneLayout.ts";

test("a wide window shows the panes as they were set", () => {
  assert.deepEqual(paneWidths(1600, 300, 400), {
    sidebarShown: 300,
    listShown: 400,
    sidebarMax: SIDEBAR_MAX,
    listMax: LIST_MAX,
  });
});

test("a narrow window shrinks both panes to fit, never below the minimums", () => {
  // 1100 - 382 = 718 of room: the list keeps what the sidebar's minimum leaves.
  const narrow = paneWidths(1100, 300, 500);
  assert.equal(narrow.listShown, 718 - SIDEBAR_MIN);
  assert.equal(narrow.sidebarShown, SIDEBAR_MIN);
  const tiny = paneWidths(600, 400, 600);
  assert.equal(tiny.sidebarShown, SIDEBAR_MIN);
  assert.equal(tiny.listShown, LIST_MIN);
});

test("the handles stop where the room ends", () => {
  const { sidebarMax, listMax } = paneWidths(1100, 248, 300);
  assert.equal(sidebarMax, 718 - 300);
  assert.equal(listMax, 718 - 248);
});

test("a docked column hides nothing when the note still fits", () => {
  assert.deepEqual(panesToHide(1600, { open: true, width: 248 }, { open: true, width: 380 }), {
    sidebar: false,
    list: false,
  });
});

test("a docked column puts the folders away first, then the list", () => {
  // 1300 - 249 - 381 - 340 = 330 < 420; without the folders 579 fits.
  assert.deepEqual(panesToHide(1300, { open: true, width: 248 }, { open: true, width: 380 }), {
    sidebar: true,
    list: false,
  });
  assert.deepEqual(panesToHide(1000, { open: true, width: 248 }, { open: true, width: 380 }), {
    sidebar: true,
    list: true,
  });
  // Folders already shut: only the list is left to put away.
  assert.deepEqual(panesToHide(1000, { open: false, width: 248 }, { open: true, width: 380 }), {
    sidebar: false,
    list: true,
  });
});

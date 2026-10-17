import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DURATION, EASE } from "./motionTokens.ts";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const declared = (name: string) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];

test("the phone's curves are the stylesheet's", () => {
  const names = {
    standard: "ease",
    out: "ease-out",
    inOut: "ease-in-out",
    spring: "ease-spring",
    bounce: "ease-bounce",
    press: "ease-press",
  } as const;
  for (const [key, name] of Object.entries(names))
    assert.equal(
      declared(name),
      `cubic-bezier(${EASE[key as keyof typeof EASE].join(", ")})`,
      name,
    );
  for (const [key, ms] of Object.entries(DURATION))
    assert.equal(declared(`dur-${key}`), `${ms}ms`, key);
});

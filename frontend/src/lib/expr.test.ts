import { expect, test } from "vitest";
import { compile } from "./expr";

// Expected values follow Python, where the backend validates the same expressions.
test.each([
  ["-x^2", { x: 3 }, -9],
  ["2^3^2", {}, 512],
  ["2^-1", {}, 0.5],
  ["-2^2", {}, -4],
  ["(-2)^2", {}, 4],
  ["1 - 2 - 3", {}, -4],
  ["8 / 4 / 2", {}, 1],
  ["2 * -3", {}, -6],
  ["a * x^2 + b", { x: 2, a: 0.5, b: 1 }, 3],
  ["max(0, x) + min(1, 2, 3)", { x: -4 }, 1],
  ["1 / (1 + exp(-x))", { x: 0 }, 0.5],
  ["1.5e1 + .5", {}, 15.5],
])("%s", (src, vars, want) => {
  expect(compile(src)(vars)).toBeCloseTo(want);
});

test.each(["2 +", "foo(1)", "x ** 2", "(1"])("rejects %s", (src) => {
  expect(() => compile(src)({ x: 1 })).toThrow();
});

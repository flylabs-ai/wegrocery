import { expect, it } from "vitest";
import { workerMode } from "./worker-mode";

it.each([
  ["true", "register"],
  ["false", "remove"],
  [undefined, "leave"],
  ["", "leave"],
  ["TRUE", "leave"],
])("maps the server flag %s to %s", (value, mode) => {
  expect(workerMode(value)).toBe(mode);
});

import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { t } from "@/lib/i18n";
import { PushDeviceStatus } from "./push-settings";

vi.mock("@/lib/actions/push-consents", () => ({}));
vi.mock("@/lib/actions/push-devices", () => ({}));

it.each([
  ["ios", false],
  ["denied", false],
  ["off", true],
  ["incomplete", true],
  ["on", false],
] as const)("renders the %s state and its available action", (state, canEnable) => {
  const html = renderToStaticMarkup(<PushDeviceStatus state={state} busy={false} onEnable={() => {}} />);
  expect(html).toContain(t.notifications.push.states[state]);
  expect(html.includes(t.notifications.push.enable)).toBe(canEnable);
});

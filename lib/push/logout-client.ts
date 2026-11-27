"use client";

import { removePushDeviceAction } from "@/lib/actions/push-devices";
import { signOutDevice } from "./device-client";

export async function signOutWithDevice(action: () => Promise<void>): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // Also bound browser calls, which can stall independently of the server.
    await Promise.race([
      signOutDevice(removePushDeviceAction),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, 4000); }),
    ]);
  } catch {
    // Device cleanup is best effort; always run the existing sign-out action.
  } finally {
    clearTimeout(timeout);
  }
  await action();
}

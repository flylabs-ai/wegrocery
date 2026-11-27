"use client";

import { devicePushStatusAction } from "@/lib/actions/push-devices";
import { readDeviceState, type DeviceState } from "./device-client";

let pending: Promise<DeviceState> | undefined;

export function reconcilePushDevice(): Promise<DeviceState> {
  // The shell and settings can mount together. Share the read because
  // checking an endpoint left by another person also removes its binding.
  pending ??= readDeviceState(devicePushStatusAction).finally(() => {
    pending = undefined;
  });
  return pending;
}

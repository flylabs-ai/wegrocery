"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { writePushConsentAction } from "@/lib/actions/push-consents";
import {
  listPushDevicesAction,
  removePushDeviceByIdAction,
  savePushDeviceAction,
} from "@/lib/actions/push-devices";
import { t } from "@/lib/i18n";
import {
  existingSubscription,
  subscribeDevice,
  unsubscribeDevice,
  type DeviceState,
} from "@/lib/push/device-client";
import { reconcilePushDevice } from "@/lib/push/reconcile-client";

const s = t.notifications.push;
type DeviceList = Awaited<ReturnType<typeof listPushDevicesAction>>;

async function readDevices(): Promise<DeviceList> {
  const subscription = await existingSubscription();
  return listPushDevicesAction(subscription?.endpoint);
}

export function PushDeviceStatus({ state, busy, onEnable }: {
  state: DeviceState;
  busy: boolean;
  onEnable: () => void;
}) {
  return (
    <>
      <p role="status" className="text-sm text-secondary-foreground">{s.states[state]}</p>
      {(state === "off" || state === "incomplete") && (
        <div><Button type="button" variant="brand" disabled={busy} onClick={onEnable}>{s.enable}</Button></div>
      )}
    </>
  );
}

export function PushSettings({ publicKey, initialDraftReminder }: { publicKey: string; initialDraftReminder: boolean }) {
  const [state, setState] = useState<DeviceState>("checking");
  const [list, setList] = useState<DeviceList | null>(null);
  const listReadVersion = useRef(0);
  const [enabled, setEnabled] = useState(initialDraftReminder);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState(false);
  const [listError, setListError] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [consentPending, startConsentTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const version = ++listReadVersion.current;
    void (async () => {
      const nextState = await reconcilePushDevice().catch(() => "unsupported" as const);
      if (active) setState(nextState);
      try {
        const nextList = await readDevices();
        if (active && version === listReadVersion.current) setList(nextList);
      } catch {
        if (active && version === listReadVersion.current) setListError(true);
      }
    })();
    return () => { active = false; };
  }, []);

  async function refreshDevices() {
    listReadVersion.current++;
    try {
      setList(await readDevices());
      setListError(false);
    } catch {
      setListError(true);
    }
  }

  async function enableDevice() {
    setDeviceBusy(true);
    setDeviceError(false);
    try {
      const outcome = await subscribeDevice(publicKey);
      if ("state" in outcome) {
        setState(outcome.state);
        return;
      }

      try {
        if (!(await savePushDeviceAction(outcome.subscription)).ok) throw new Error();
      } catch {
        setDeviceError(true);
        await unsubscribeDevice().catch(() => null);
        setState(await reconcilePushDevice().catch(() => "off" as const));
        return;
      }

      setState("on");
      await refreshDevices();
    } catch {
      setDeviceError(true);
    } finally {
      setDeviceBusy(false);
    }
  }

  async function unlinkDevice(id: string) {
    setDeviceBusy(true);
    setDeviceError(false);
    try {
      const { ok } = await removePushDeviceByIdAction(id);
      if (ok && id === list?.current) {
        await unsubscribeDevice();
      }
      setState(await reconcilePushDevice());
    } catch {
      setDeviceError(true);
    } finally {
      await refreshDevices();
      setDeviceBusy(false);
    }
  }

  function toggleConsent(next: boolean) {
    setConsentError(false);
    startConsentTransition(async () => {
      try {
        const result = await writePushConsentAction("draft_reminder", next);
        if (result.ok) setEnabled(next);
        else setConsentError(true);
      } catch {
        setConsentError(true);
      }
    });
  }

  return (
    <section aria-labelledby="push-settings-title" className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <h2 id="push-settings-title" className="flex items-center gap-2 text-base font-bold">
        <BellRing aria-hidden="true" className="size-4" /> {s.title}
      </h2>
      <PushDeviceStatus state={state} busy={deviceBusy} onEnable={enableDevice} />
      {deviceError && <p role="alert" className="text-sm text-destructive">{s.deviceError}</p>}

      <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        <span>{s.draftReminder}</span>
        <Checkbox checked={enabled} disabled={consentPending} onCheckedChange={toggleConsent} />
      </label>
      {consentError && <p role="alert" className="text-sm text-destructive">{s.consentError}</p>}

      <div className="border-t border-border pt-3">
        <h3 className="text-sm font-bold">{s.devices}</h3>
        {listError && <p role="alert" className="text-sm text-destructive">{s.listError}</p>}
        {list?.devices.length === 0 && <p className="mt-2 text-sm text-secondary-foreground">{s.empty}</p>}
        {!!list?.devices.length && (
          <ul className="mt-2 divide-y divide-border">
            {list.devices.map(({ id, label }) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  {label ?? s.unknown}
                  {id === list.current && <span className="block text-secondary-foreground">{s.current}</span>}
                </span>
                <Button type="button" variant="outline" disabled={deviceBusy || state === "checking"} onClick={() => void unlinkDevice(id)}>
                  {s.unlink}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

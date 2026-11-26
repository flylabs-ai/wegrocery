import { afterAll, beforeAll, expect, it } from "vitest";
import { describeDb, makeScope } from "@/test/int/fixtures";
import { getDb } from "@/lib/db/client";
import { currentDeviceId, devicePushStatus, listDevices, removeDevice, removeDeviceById, saveDevice } from "./devices";

// DEV-02/03/04/06 on the real table (migration 0057). Fake endpoints of an
// allowed host; no real subscription, key or person.
describeDb("push devices (DEV-02/03/04/06)", () => {
  const scope = makeScope("push_devices");
  const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
  const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${scope.id(name)}`;
  let personA: string;
  let personB: string;

  beforeAll(async () => {
    await scope.createMember();
    personA = scope.memberId;
    personB = await scope.createExtraMember("b");
  });
  afterAll(() => scope.cleanup());

  it("DEV-02: mine for the owner, none for an unknown endpoint", async () => {
    const db = getDb();
    await saveDevice(db, personA, { endpoint: endpoint("a1"), ...keys }, "iPhone");
    expect(await devicePushStatus(db, personA, endpoint("a1"))).toBe("mine");
    expect(await devicePushStatus(db, personA, endpoint("unknown"))).toBe("none");
  });

  it("DEV-03: B presenting A's endpoint drops A's row and binds nothing to B", async () => {
    const db = getDb();
    await saveDevice(db, personA, { endpoint: endpoint("shared"), ...keys }, "Chrome · Mac");
    expect(await devicePushStatus(db, personB, endpoint("shared"))).toBe("other");
    expect(await devicePushStatus(db, personA, endpoint("shared"))).toBe("none");
    expect(await devicePushStatus(db, personB, endpoint("shared"))).toBe("none");
    expect((await listDevices(db, personB)).length).toBe(0);
  });

  it("re-saving the same browser as another person moves it to them", async () => {
    const db = getDb();
    await saveDevice(db, personA, { endpoint: endpoint("moved"), ...keys }, null);
    await saveDevice(db, personB, { endpoint: endpoint("moved"), ...keys }, "Android");
    expect(await devicePushStatus(db, personB, endpoint("moved"))).toBe("mine");
    await removeDevice(db, personB, endpoint("moved"));
  });

  it("DEV-04: logout on phone 1 keeps phone 2; B cannot remove A's row", async () => {
    const db = getDb();
    await saveDevice(db, personA, { endpoint: endpoint("phone1"), ...keys }, "iPhone");
    await saveDevice(db, personA, { endpoint: endpoint("phone2"), ...keys }, "Android");
    expect(await removeDevice(db, personB, endpoint("phone2"))).toBe(false);
    expect(await removeDevice(db, personA, endpoint("phone1"))).toBe(true);
    expect(await devicePushStatus(db, personA, endpoint("phone1"))).toBe("none");
    expect(await devicePushStatus(db, personA, endpoint("phone2"))).toBe("mine");
  });

  it("DEV-06: lists only the person's devices, without endpoints, and unbinds by id", async () => {
    const db = getDb();
    const devices = await listDevices(db, personA);
    expect(devices.length).toBeGreaterThanOrEqual(2);
    for (const device of devices) expect(Object.keys(device).sort()).toEqual(["createdAt", "id", "label", "lastUsedAt"]);
    const phone2 = await currentDeviceId(db, personA, endpoint("phone2"));
    expect(phone2).not.toBeNull();
    expect(await currentDeviceId(db, personB, endpoint("phone2"))).toBeNull();
    expect(await removeDeviceById(db, personB, phone2!)).toBe(false);
    expect(await removeDeviceById(db, personA, phone2!)).toBe(true);
    expect(await devicePushStatus(db, personA, endpoint("phone2"))).toBe("none");
  });
});

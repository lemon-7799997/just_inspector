/**
 * End-to-end smoke test: starts the mock game server in-process, connects a
 * real InspectorClient (Node transport), and exercises the full protocol.
 *
 * Run with: npm run smoke -w just-inspector-mock-server
 */

import assert from "node:assert/strict";
import { InspectorClient, Events, ErrorCodes, type ValueType } from "@just-inspector/client";
import { NodeTransport } from "@just-inspector/client/node";
import { bool, color, curve, enumValue, float, int, str, vec3 } from "@just-inspector/protocol";
import { createGameServer } from "./server.js";

let passed = 0;
function check(label: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function expectReject(promise: Promise<unknown>, code: number, label: string): Promise<void> {
  try {
    await promise;
    throw new Error(`expected rejection (${label})`);
  } catch (err) {
    const e = err as Error & { code?: number };
    assert.equal(e.code, code, `${label}: expected error code ${code}, got ${e.code ?? e.message}`);
    passed += 1;
    console.log(`  ✓ ${label} (rejected with ${code})`);
  }
}

async function main(): Promise<void> {
  console.log("starting mock server…");
  const server = await createGameServer({ port: 0, tickMs: 0, structureMs: 0 });
  const url = `ws://127.0.0.1:${server.port}`;

  console.log(`connecting to ${url} …`);
  const client = new InspectorClient(new NodeTransport(), { autoReconnect: false, requestTimeoutMs: 5000 });

  // Server pushes Inspector.ready right after the socket opens — subscribe
  // BEFORE connecting so we don't miss it.
  const readyPromise = new Promise<unknown>((resolve) => client.once(Events.ready, resolve));

  // status lifecycle
  const statuses: string[] = [];
  client.onStatus((s) => statuses.push(s));
  await client.connect(url);
  check("connect() resolves and status reached 'connected'", () => {
    assert.ok(statuses.includes("connected"), `statuses=${statuses.join(",")}`);
    assert.equal(client.connected, true);
  });

  // handshake
  const hello = await client.hello();
  check("Inspector.hello returns game info", () => {
    assert.equal(hello.gameName, "Mock Arena");
    assert.equal(hello.engine, "mock");
    assert.equal(hello.protocolVersion, "1.0");
  });

  // server pushes Inspector.ready on connect
  const ready = await readyPromise;
  check("Inspector.ready event received on connect", () => {
    assert.equal((ready as { gameName: string }).gameName, "Mock Arena");
  });

  // ping
  const ping = await client.ping();
  check("Inspector.ping returns pong", () => {
    assert.equal(ping.pong, "pong");
  });

  // tree
  const { root } = await client.getTree();
  check("Runtime.getTree returns the root node", () => {
    assert.equal(root.name, "MainScene");
    assert.ok(root.children && root.children.length >= 3);
  });

  const player = (root.children ?? [])
    .find((c) => c.id === "world")
    ?.children?.find((c) => c.id === "player");
  assert.ok(player, "player node exists in tree");
  const playerId = player.id;

  // node detail — every control type present
  const { node } = await client.getNode(playerId);
  check("Runtime.getNode returns full property list", () => {
    assert.equal(node.name, "Player");
    const types = new Set(node.properties.map((p) => p.value.type));
    const expected: ValueType[] = ["string", "int", "float", "bool", "color", "enum", "vec3", "curve", "array", "object", "asset"];
    for (const t of expected) {
      assert.ok(types.has(t), `player has a '${t}' property`);
    }
  });

  // setValue round trips
  const s1 = await client.setValue(playerId, "nickname", str("SmokeTest"));
  check("setValue (string) echoes normalized value", () => {
    assert.equal((s1.value as { value: string }).value, "SmokeTest");
  });
  const s2 = await client.setValue(playerId, "health", int(42));
  check("setValue (int) applies", () => {
    assert.equal((s2.value as { value: number }).value, 42);
  });

  // nodeChanged event fires after setValue
  const changed = await new Promise<{ nodeId: string; property?: string }>((resolve) => {
    client.once(Events.nodeChanged, (params) => resolve(params as { nodeId: string; property?: string }));
    void client.setValue(playerId, "health", int(43));
  });
  check("Runtime.nodeChanged event received after setValue", () => {
    assert.equal(changed.nodeId, playerId);
    assert.equal(changed.property, "health");
  });

  // more setValue variants
  const s3 = await client.setValue(playerId, "position", vec3(2, 3, 4));
  check("setValue (vec3) applies", () => {
    const v = s3.value as { x: number; y: number; z: number };
    assert.deepEqual([v.x, v.y, v.z], [2, 3, 4]);
  });
  const s4 = await client.setValue(playerId, "team", enumValue("green", []));
  check("setValue (enum) applies", () => {
    assert.equal((s4.value as { value: string }).value, "green");
  });
  const s5 = await client.setValue(playerId, "primaryColor", color(1, 0, 0, 1));
  check("setValue (color) applies", () => {
    const c = s5.value as { r: number; g: number; b: number };
    assert.deepEqual([c.r, c.g, c.b], [1, 0, 0]);
  });
  const s6 = await client.setValue(playerId, "isAlive", bool(false));
  check("setValue (bool) applies", () => {
    assert.equal((s6.value as { value: boolean }).value, false);
  });
  const s7 = await client.setValue(playerId, "attackCurve", curve([{ x: 0, y: 0, lx: 0, ly: 0, rx: 0.5, ry: 1 }, { x: 1, y: 1, lx: -0.5, ly: -1, rx: 0, ry: 0 }]));
  check("setValue (curve) applies", () => {
    const c = s7.value as { points: Array<{ x: number; y: number }> };
    assert.equal(c.points.length, 2);
    assert.equal(c.points[1].y, 1);
  });

  // error paths
  await expectReject(client.getNode("node:does-not-exist"), ErrorCodes.UnknownNode, "getNode on unknown node");
  await expectReject(
    client.setValue(root.id, "sceneName", str("nope")),
    ErrorCodes.ReadOnlyProperty,
    "setValue on read-only property",
  );
  await expectReject(
    client.setValue(playerId, "health", str("nope")),
    ErrorCodes.InvalidValue,
    "setValue with wrong value type",
  );
  await expectReject(client.request("No.suchMethod"), ErrorCodes.MethodNotFound, "unknown method");

  // value actually changed server-side (read back)
  const after = await client.getNode(playerId);
  const health = after.node.properties.find((p) => p.name === "health");
  check("server state persisted the setValue", () => {
    assert.equal((health?.value as { value: number }).value, 43);
  });

  // multi-client: second client sees the same tree
  const client2 = new InspectorClient(new NodeTransport(), { autoReconnect: false });
  await client2.connect(url);
  const tree2 = await client2.getTree();
  check("a second client can connect and read the tree", () => {
    assert.equal(tree2.root.name, "MainScene");
  });
  client2.disconnect();

  // attach/detach (optional protocol methods)
  const attach = await client.attach({ name: "smoke" });
  check("Inspector.attach returns a session", () => {
    assert.ok(typeof attach.sessionId === "string" && attach.sessionId.length > 0);
  });
  await client.detach();

  client.disconnect();
  await server.close();

  console.log(`\n✅ smoke test passed (${passed} assertions)`);
}

main().catch((err) => {
  console.error("\n❌ smoke test failed:", err);
  process.exit(1);
});

// src/main/sidecar/client.test.ts
//
// Integration tests for SidecarClient against a real SidecarServer.
// Must run with node (not bun) because node-pty requires node's libuv.
//
// Run: cd collab-electron && npx tsx --test src/main/sidecar/client.test.ts

import { describe, it, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SidecarServer } from "./server";
import { SidecarClient } from "./client";
import { SIDECAR_VERSION } from "./protocol";

// Short temp dir to stay under macOS 104-byte sun_path limit
const TEST_DIR = path.join(os.tmpdir(), `cc-${process.pid}`);
const CONTROL_SOCK = path.join(TEST_DIR, "ctrl.sock");
const SESSION_DIR = path.join(TEST_DIR, "s");
const PID_PATH = path.join(TEST_DIR, "pid");
const TOKEN = "client-test-token";

let server: SidecarServer | null = null;
let client: SidecarClient | null = null;

afterEach(async () => {
  if (client) {
    client.disconnect();
    client = null;
  }
  if (server) {
    await server.shutdown();
    server = null;
  }
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

async function startServer(): Promise<void> {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  server = new SidecarServer({
    controlSocketPath: CONTROL_SOCK,
    sessionSocketDir: SESSION_DIR,
    pidFilePath: PID_PATH,
    token: TOKEN,
    idleTimeoutMs: 0,
  });
  await server.start();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SidecarClient", () => {
  it("connects and pings", async () => {
    await startServer();
    client = new SidecarClient(CONTROL_SOCK);
    await client.connect();

    const ping = await client.ping();
    assert.equal(ping.version, SIDECAR_VERSION);
    assert.equal(ping.token, TOKEN);
  });

  it("creates session and receives data", async () => {
    await startServer();
    client = new SidecarClient(CONTROL_SOCK);
    await client.connect();

    const { sessionId, socketPath } = await client.createSession({
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
    assert.match(sessionId, /^[0-9a-f]{16}$/);

    const chunks: string[] = [];
    const dataSock = await client.attachDataSocket(
      socketPath,
      (data) => chunks.push(data),
    );

    dataSock.write("echo client-test\n");

    // Wait until we see the expected output or timeout
    const deadline = Date.now() + 5000;
    while (
      !chunks.join("").includes("client-test")
      && Date.now() < deadline
    ) {
      await sleep(50);
    }

    assert.ok(chunks.join("").includes("client-test"));
    dataSock.destroy();
  });

  it("lists sessions", async () => {
    await startServer();
    client = new SidecarClient(CONTROL_SOCK);
    await client.connect();

    await client.createSession({
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });

    const sessions = await client.listSessions();
    assert.equal(sessions.length, 1);
  });

  it("kills session", async () => {
    await startServer();
    client = new SidecarClient(CONTROL_SOCK);
    await client.connect();

    const { sessionId } = await client.createSession({
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });

    await client.killSession(sessionId);

    const sessions = await client.listSessions();
    assert.equal(sessions.length, 0);
  });
});

// src/main/sidecar/server.test.ts
//
// Integration tests for SidecarServer. Must run with node (not bun)
// because node-pty's native addon requires node's libuv event loop.
//
// Run: cd collab-electron && npx tsx --test src/main/sidecar/server.test.ts

import { describe, it, afterEach } from "node:test";
import * as assert from "node:assert/strict";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SidecarServer } from "./server";
import {
  makeRequest,
  type JsonRpcResponse,
  type PingResult,
  type SessionCreateResult,
  type SessionReconnectResult,
  type SessionInfo,
  SIDECAR_VERSION,
} from "./protocol";

// Use short temp dir to stay under macOS 104-byte sun_path limit
const TEST_DIR = path.join(os.tmpdir(), `sc-${process.pid}`);
const CONTROL_SOCK = path.join(TEST_DIR, "ctrl.sock");
const SESSION_DIR = path.join(TEST_DIR, "s");
const PID_PATH = path.join(TEST_DIR, "pid");
const TOKEN = "test-token-abc123";

let server: SidecarServer | null = null;

afterEach(async () => {
  if (server) {
    await server.shutdown();
    server = null;
  }
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function connectControl(): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(CONTROL_SOCK, () => resolve(sock));
    sock.on("error", reject);
  });
}

function rpcCall(
  sock: net.Socket,
  id: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        sock.off("data", onData);
        resolve(JSON.parse(buf.slice(0, nl)));
      }
    };
    sock.on("data", onData);
    sock.write(makeRequest(id, method, params));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SidecarServer", () => {
  it("starts and responds to ping", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const sock = await connectControl();
    const resp = await rpcCall(sock, 1, "sidecar.ping");
    const result = resp.result as PingResult;

    assert.equal(result.version, SIDECAR_VERSION);
    assert.equal(result.token, TOKEN);
    assert.equal(result.pid, process.pid);
    assert.equal(typeof result.uptime, "number");

    sock.destroy();
  });
});

describe("SidecarServer session lifecycle", () => {
  it("session.create spawns a shell and returns socketPath", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const sock = await connectControl();
    const resp = await rpcCall(sock, 1, "session.create", {
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });

    const result = resp.result as SessionCreateResult;
    assert.match(result.sessionId, /^[0-9a-f]{16}$/);
    assert.ok(result.socketPath.includes(result.sessionId));
    assert.ok(fs.existsSync(result.socketPath));

    sock.destroy();
  });

  it("data socket sends PTY output", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const ctrl = await connectControl();
    const createResp = await rpcCall(ctrl, 1, "session.create", {
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
    const { socketPath } =
      createResp.result as SessionCreateResult;

    // Connect data socket
    const data = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection(socketPath, () => resolve(s));
      s.on("error", reject);
    });

    // Send a command and wait for output
    data.write("echo sidecar-test-output\n");
    const output = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => {
        data.off("data", onData);
        reject(new Error(
          `Timed out waiting for PTY output. Got: ${JSON.stringify(buf)}`,
        ));
      }, 5000);
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        if (buf.includes("sidecar-test-output")) {
          clearTimeout(timer);
          data.off("data", onData);
          resolve(buf);
        }
      };
      data.on("data", onData);
    });

    assert.ok(output.includes("sidecar-test-output"));

    data.destroy();
    ctrl.destroy();
  });

  it("session.list returns created sessions", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const sock = await connectControl();
    await rpcCall(sock, 1, "session.create", {
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });

    const listResp = await rpcCall(sock, 2, "session.list");
    const { sessions } =
      listResp.result as { sessions: SessionInfo[] };
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].shell, "/bin/sh");

    sock.destroy();
  });

  it("session.kill removes session from list", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const sock = await connectControl();
    const createResp = await rpcCall(sock, 1, "session.create", {
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
    const { sessionId } =
      createResp.result as SessionCreateResult;

    await rpcCall(sock, 2, "session.kill", { sessionId });

    const listResp = await rpcCall(sock, 3, "session.list");
    const { sessions } =
      listResp.result as { sessions: SessionInfo[] };
    assert.equal(sessions.length, 0);

    sock.destroy();
  });

  it("session.reconnect returns scrollback over data socket", async () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    server = new SidecarServer({
      controlSocketPath: CONTROL_SOCK,
      sessionSocketDir: SESSION_DIR,
      pidFilePath: PID_PATH,
      token: TOKEN,
      idleTimeoutMs: 0,
    });
    await server.start();

    const ctrl = await connectControl();

    // Create session and write some output
    const createResp = await rpcCall(ctrl, 1, "session.create", {
      shell: "/bin/sh",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
    const { sessionId, socketPath } =
      createResp.result as SessionCreateResult;

    // Connect, send command, wait for output, then disconnect
    const data1 = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection(socketPath, () => resolve(s));
      s.on("error", reject);
    });
    data1.write("echo reconnect-marker\n");
    await new Promise<void>((resolve) => {
      const onData = (chunk: Buffer) => {
        if (chunk.toString().includes("reconnect-marker")) {
          data1.off("data", onData);
          resolve();
        }
      };
      data1.on("data", onData);
    });
    data1.destroy();
    await sleep(100);

    // Reconnect
    const reconResp = await rpcCall(ctrl, 2, "session.reconnect", {
      sessionId,
      cols: 80,
      rows: 24,
    });
    assert.equal(
      (reconResp.result as SessionReconnectResult).sessionId,
      sessionId,
    );

    // Connect new data socket — should receive scrollback
    const data2 = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection(socketPath, () => resolve(s));
      s.on("error", reject);
    });

    const scrollback = await new Promise<string>((resolve) => {
      let buf = "";
      const onData = (chunk: Buffer) => {
        buf += chunk.toString();
        if (buf.includes("reconnect-marker")) {
          data2.off("data", onData);
          resolve(buf);
        }
      };
      data2.on("data", onData);
      // Timeout fallback
      setTimeout(() => {
        data2.off("data", onData);
        resolve(buf);
      }, 2000);
    });

    assert.ok(scrollback.includes("reconnect-marker"));

    data2.destroy();
    ctrl.destroy();
  });
});

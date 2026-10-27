import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import processes from "./process-manager.cjs";

function setup() {
  let nextPid = 900000;
  const commands = {
    spawn: vi.fn(() => Object.assign(new EventEmitter(), { pid: nextPid++ })),
    execFile: vi.fn((_file, _args, _options, callback) => {
      callback?.(null, "");
      return Object.assign(new EventEmitter(), { pid: nextPid++ });
    }),
  };
  return { commands, manager: processes.createProcessManager({ platform: "win32", commands }) };
}

describe("process cleanup", () => {
  it("terminates the trees of active apps and helpers, but ignores exited processes", async () => {
    const { manager, commands } = setup();
    const application = manager.spawn("app.exe", []);
    const helper = manager.execFile("powershell.exe", [], {});
    const exited = manager.spawn("already-closed.exe", []);
    exited.emit("exit", 0);

    await manager.stopAll();

    const kills = commands.execFile.mock.calls.filter(([file]) => file === "taskkill.exe");
    expect(kills.map(([, args]) => args)).toEqual([
      ["/PID", String(application.pid), "/T", "/F"],
      ["/PID", String(helper.pid), "/T", "/F"],
    ]);
    expect(kills.every(([, , options]) => options.windowsHide && options.timeout === 4000)).toBe(true);
  });

  it("blocks new work during shutdown and only starts cleanup once", async () => {
    const { manager, commands } = setup();
    manager.spawn("py.exe", []);
    const first = manager.stopAll();
    expect(manager.stopAll()).toBe(first);
    await first;
    expect(() => manager.spawn("python.exe", [])).toThrow("encerrado");
    expect(() => manager.execFile("powershell.exe", [], {})).toThrow("encerrado");
    expect(commands.execFile).toHaveBeenCalledTimes(1);
  });

  it("stops the Python launcher and its child rather than just the launcher", async () => {
    const { manager, commands } = setup();
    const python = manager.spawn("py.exe", ["-3", "helper.py"]);
    await manager.killChild(python);
    expect(commands.execFile).toHaveBeenCalledWith("taskkill.exe", ["/PID", String(python.pid), "/T", "/F"], expect.any(Object), expect.any(Function));
    python.emit("exit", 0);
    await manager.stopAll();
    expect(commands.execFile).toHaveBeenCalledTimes(1);
  });
});

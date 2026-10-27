import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import updates from "./update-manager.cjs";

function setup({ enabled = true } = {}) {
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn(async () => {
    updater.emit("update-available", { version: "1.5.0" });
  });
  updater.downloadUpdate = vi.fn(async () => {
    updater.emit("download-progress", { percent: 54.2 });
    updater.emit("update-downloaded", { version: "1.5.0" });
  });
  updater.quitAndInstall = vi.fn();
  const notify = vi.fn();
  const confirmInstall = vi.fn(async () => true);
  const getUpdater = vi.fn(() => updater);
  const manager = updates.createUpdateManager({
    currentVersion: "1.4.0", enabled, getUpdater, notify, confirmInstall,
    logger: { log() {}, warn() {}, error() {} },
  });
  return { manager, updater, notify, confirmInstall, getUpdater };
}

afterEach(() => vi.useRealTimers());

describe("application updates", () => {
  it("checks after startup and every six hours, without automatically downloading or installing", async () => {
    vi.useFakeTimers();
    const { manager, updater } = setup();
    manager.start();
    manager.start();
    await vi.advanceTimersByTimeAsync(9999);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toMatchObject({ status: "available", availableVersion: "1.5.0", canDownload: true });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    manager.dispose();
  });

  it("keeps updates disabled in development without initializing the updater", async () => {
    vi.useFakeTimers();
    const { manager, getUpdater, confirmInstall } = setup({ enabled: false });
    manager.start();
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    await manager.check();
    await manager.download();
    await manager.install();
    expect(getUpdater).not.toHaveBeenCalled();
    expect(confirmInstall).not.toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({ status: "disabled", canDownload: false, canInstall: false });
  });

  it("downloads on request, publishes progress and preserves a ready download during later checks", async () => {
    const { manager, updater, notify } = setup();
    await manager.check();
    await manager.download();
    expect(notify.mock.calls.some(([state]) => state.status === "downloading" && state.progress === 54.2)).toBe(true);
    expect(manager.getState()).toMatchObject({ status: "downloaded", progress: 100, canInstall: true, canDownload: false });
    await manager.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("allows only one check, download and installation confirmation at a time", async () => {
    const { manager, updater, confirmInstall } = setup();
    const check = manager.check();
    expect(manager.check()).toBe(check);
    await check;
    const download = manager.download();
    expect(manager.download()).toBe(download);
    await download;
    const install = manager.install();
    expect(manager.install()).toBe(install);
    await install;
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(confirmInstall).toHaveBeenCalledTimes(1);
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
  });

  it("does not install before a validated download or after declining confirmation", async () => {
    const { manager, updater, confirmInstall } = setup();
    await manager.install();
    await manager.check();
    await manager.install();
    expect(confirmInstall).not.toHaveBeenCalled();
    await manager.download();
    confirmInstall.mockResolvedValue(false);
    await manager.install();
    expect(manager.getState().status).toBe("downloaded");
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("recovers from an offline check and a failed or corrupt download without permitting installation", async () => {
    const { manager, updater } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    await manager.check();
    expect(manager.getState()).toMatchObject({ status: "error", canDownload: false, canInstall: false });
    await manager.check();
    updater.downloadUpdate.mockRejectedValueOnce(new Error("checksum mismatch"));
    await manager.download();
    expect(manager.getState()).toMatchObject({ status: "error", canDownload: true, canInstall: false });
    await manager.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await manager.download();
    expect(manager.getState()).toMatchObject({ status: "downloaded", canInstall: true });
  });

  it("keeps a downloaded update available for retry if the installer reports an error", async () => {
    const { manager, updater } = setup();
    await manager.check();
    await manager.download();
    updater.quitAndInstall.mockImplementationOnce(() => updater.emit("error", new Error("installer failed")));
    await manager.install();
    expect(manager.getState()).toMatchObject({ status: "error", canInstall: true });
    await manager.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it("reports the current version when no update is available", async () => {
    const { manager, updater } = setup();
    updater.checkForUpdates.mockImplementationOnce(async () => updater.emit("update-not-available"));
    await manager.check();
    expect(manager.getState()).toMatchObject({ status: "up-to-date", currentVersion: "1.4.0", availableVersion: null });
  });

  it("stops timers and ignores late events and pending actions during shutdown", async () => {
    vi.useFakeTimers();
    const { manager, updater, notify } = setup();
    manager.start();
    await manager.check();
    const download = manager.download();
    manager.dispose();
    notify.mockClear();
    await download;
    updater.emit("error", new Error("late callback"));
    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(manager.getState().canInstall).toBe(false);
  });
});

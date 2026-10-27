import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const directory = path.dirname(fileURLToPath(import.meta.url));

function setup({ mainDirectory = directory } = {}) {
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true,
    setName: vi.fn(),
    setAppUserModelId: vi.fn(),
    getAppPath: () => directory,
    getPath: () => directory,
    getVersion: () => "test",
    whenReady: () => new Promise(() => {}),
    exit: vi.fn(),
  });
  const windows = [];
  class Window extends EventEmitter {
    constructor() {
      super();
      this.destroyed = false;
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {}, send: vi.fn() });
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    setAlwaysOnTop() {}
    setIcon() {}
    show() {}
    hide() {}
    loadFile() { return Promise.resolve(); }
    showInactive() {}
    close() {
      let prevented = false;
      this.emit("close", { preventDefault() { prevented = true; } });
      if (!prevented) this.destroy();
    }
    destroy() { this.destroyed = true; this.emit("closed"); }
    static fromWebContents(sender) { return windows.find((window) => window.webContents === sender); }
  }
  app.quit = vi.fn(() => {
    let prevented = false;
    app.emit("before-quit", { preventDefault() { prevented = true; } });
    if (!prevented) windows.forEach((window) => window.close());
  });
  const handlers = new Map();
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: vi.fn(async () => updater.emit("update-available", { version: "1.5.0" })),
    downloadUpdate: vi.fn(async () => updater.emit("update-downloaded", { version: "1.5.0" })),
    quitAndInstall: vi.fn(() => app.quit()),
  });
  const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
  const processManager = { stopAll: vi.fn(() => Promise.resolve()), killProcess: vi.fn() };
  const context = vm.createContext({
    require: (name) => {
      if (name === "electron") return { app, dialog, BrowserWindow: Window, nativeImage: { createFromPath: () => ({ isEmpty: () => false }) }, ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) } };
      if (name === "electron-updater") return { autoUpdater: updater };
      if (name === "./process-manager.cjs") return { createProcessManager: () => processManager };
      if (name === "fs") return { ...fs, mkdirSync() {}, appendFileSync() {} };
      return require(name);
    },
    __dirname: mainDirectory,
    process,
    console: { log() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  vm.runInContext(fs.readFileSync(path.join(directory, "main.cjs"), "utf8"), context);
  const main = new Window();
  context.testMain = main;
  vm.runInContext("mainWindow = testMain", context);
  return { app, main, handlers, context, processManager, windows, updater, dialog };
}

afterEach(() => vi.useRealTimers());

describe("browser tabs", () => {
  it("migrates the saved single URL and preserves multiple tabs when saving again", () => {
    const { context } = setup();
    const legacy = vm.runInContext("sanitizeConfig({ browser: { url: ' https://exemplo.com ' } })", context);
    expect(legacy.browser.urls).toEqual(["https://exemplo.com"]);

    const config = vm.runInContext(`sanitizeConfig({ browser: {
      urls: ['https://exemplo.com', '', null, 42, ' https://outro.com/pagina ']
    } })`, context);
    expect(config.browser.urls).toEqual(["https://exemplo.com", "https://outro.com/pagina"]);
    context.savedConfig = JSON.parse(JSON.stringify(config));
    expect(vm.runInContext("sanitizeConfig(savedConfig).browser.urls", context))
      .toEqual(config.browser.urls);
    expect(vm.runInContext("sanitizeConfig({ browser: { urls: [], url: 'https://antigo.com' } }).browser.urls", context))
      .toEqual([]);
  });

  it("launches all configured tabs in one browser process and ignores blank fields", async () => {
    const { context, handlers } = setup();
    const launch = vi.fn().mockResolvedValue({ success: true, pid: 123 });
    context.testLaunchProcess = launch;
    vm.runInContext("launchProcess = testLaunchProcess", context);

    await expect(handlers.get("launch-browser")({}, {
      path: "C:\\Apps\\browser.exe",
      urls: ["exemplo.com", " ", "https://outro.com/pagina?x=1&y=2"],
    })).resolves.toEqual({ success: true, pid: 123 });
    expect(launch).toHaveBeenCalledExactlyOnceWith("C:\\Apps\\browser.exe",
      ["https://exemplo.com/", "https://outro.com/pagina?x=1&y=2"], "browser");
  });

  it("validates every tab before launching and rejects an empty tab list", async () => {
    const { context, handlers } = setup();
    const launch = vi.fn();
    context.testLaunchProcess = launch;
    vm.runInContext("launchProcess = testLaunchProcess", context);

    await expect(handlers.get("launch-browser")({}, {
      path: "C:\\Apps\\browser.exe",
      urls: ["https://exemplo.com", "https://"],
    })).rejects.toThrow("Não foi possível abrir o navegador");
    await expect(handlers.get("launch-browser")({}, {
      path: "C:\\Apps\\browser.exe", urls: ["", " "],
    })).rejects.toThrow("Informe ao menos uma URL");
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("desktop application lifecycle", () => {
  it("allows update actions only from the main renderer", () => {
    const { main, handlers } = setup();
    for (const channel of ["get-update-state", "check-for-updates", "download-update", "install-update"]) {
      expect(() => handlers.get(channel)({ sender: {} })).toThrow("nesta janela");
    }
    expect(handlers.get("get-update-state")({ sender: main.webContents }).currentVersion).toBe("test");
  });

  it("cleans up the profile normally when installing a confirmed update", async () => {
    vi.useFakeTimers();
    const { main, handlers, context, processManager, updater, dialog } = setup();
    const event = { sender: main.webContents };
    await handlers.get("check-for-updates")(event);
    await handlers.get("download-update")(event);
    dialog.showMessageBox.mockResolvedValueOnce({ response: 1 });
    await handlers.get("install-update")(event);
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await handlers.get("install-update")(event);
    await vi.advanceTimersByTimeAsync(0);
    expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(false, true);
    expect(processManager.stopAll).toHaveBeenCalledTimes(1);
    expect(vm.runInContext("shutdownComplete", context)).toBe(true);
    expect(main.isDestroyed()).toBe(true);
  });

  it("resolves native scripts outside the packaged ASAR archive", () => {
    const resources = path.join(directory, "release", "resources");
    const { context } = setup({ mainDirectory: path.join(resources, "app.asar", "electron") });
    expect(vm.runInContext("getPowerShellScriptPath('windows-applications.ps1')", context))
      .toBe(path.join(resources, "app.asar.unpacked", "electron", "windows-applications.ps1"));
  });

  it("also cleans up when the operating system closes the main window", async () => {
    vi.useFakeTimers();
    const { context, processManager } = setup();
    vm.runInContext("mainWindow = null; createWindow(); mainWindow.close()", context);
    await vi.advanceTimersByTimeAsync(0);
    expect(processManager.stopAll).toHaveBeenCalledTimes(1);
    expect(vm.runInContext("shutdownComplete", context)).toBe(true);
  });

  it("exits within the deadline when cleanup stalls", async () => {
    vi.useFakeTimers();
    const { app, processManager } = setup();
    processManager.stopAll.mockReturnValue(new Promise(() => {}));
    app.quit();
    app.quit();
    await vi.advanceTimersByTimeAsync(7000);
    expect(processManager.stopAll).toHaveBeenCalledTimes(1);
    expect(app.exit).toHaveBeenCalledWith(0);
  });

  it("quits and destroys a hidden notification window when the main X is clicked", async () => {
    vi.useFakeTimers();
    const { app, main, handlers, context, processManager, windows } = setup();
    vm.runInContext("showJarvisNotification({ title: 'test' }); notificationTimers.set('test', setTimeout(() => {}, 10000))", context);
    expect(windows).toHaveLength(2);
    const notification = windows[1];
    await handlers.get("close-window")({ sender: main.webContents });
    await Promise.resolve();
    await Promise.resolve();

    expect(notification.isDestroyed()).toBe(true);
    expect(processManager.stopAll).toHaveBeenCalledTimes(1);
    expect(vm.runInContext("notificationTimers.size", context)).toBe(0);
    expect(vm.runInContext("shutdownComplete", context)).toBe(true);
    expect(app.quit).toHaveBeenCalledTimes(2);
    expect(main.isDestroyed()).toBe(true);
    vm.runInContext("showJarvisNotification({ title: 'late callback' })", context);
    expect(windows).toHaveLength(2);
  });

  it("preserves packaged apps while loading config and removes duplicate executable entries", () => {
    const { context } = setup();
    const result = vm.runInContext(`sanitizeConfig({ applications: [{ name: 'Teams', executable: 'ms-teams.exe', path: 'shell:AppsFolder\\\\MSTeams_8wekyb3d8bbwe!MSTeams', icon: null }] })`, context);
    expect(result.applications).toHaveLength(1);
    const unique = vm.runInContext(`uniqueApplications([
      { name: 'Teams EXE', path: 'C:\\\\Apps\\\\ms-teams.exe' },
      { name: 'Teams', path: 'shell:AppsFolder\\\\MSTeams_8wekyb3d8bbwe!MSTeams', iconPath: 'C:\\\\Apps\\\\ms-teams.exe' }
    ])`, context);
    expect(unique).toHaveLength(1);
    expect(unique[0].name).toBe("Teams");
  });
});

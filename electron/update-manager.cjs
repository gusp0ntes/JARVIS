const automaticCheckInterval = 6 * 60 * 60 * 1000;

function createUpdateManager({
  currentVersion,
  enabled,
  getUpdater,
  notify = () => {},
  confirmInstall = async () => true,
  isShuttingDown = () => false,
  logger = console,
}) {
  let state = {
    status: enabled ? "idle" : "disabled",
    currentVersion,
    availableVersion: null,
    progress: 0,
    message: null,
  };
  let updater;
  let downloaded = false;
  let checkPromise;
  let downloadPromise;
  let installPromise;
  let startupTimer;
  let interval;
  let disposed = false;

  const active = () => enabled && !disposed && !isShuttingDown();
  const busy = () => ["checking", "downloading", "installing"].includes(state.status);
  const getState = () => ({
    ...state,
    canDownload: Boolean(state.availableVersion) && !downloaded && !busy() && active(),
    canInstall: downloaded && !busy() && active(),
  });

  function publish(patch) {
    if (!active()) return;
    state = { ...state, ...patch };
    notify(getState());
  }

  function fail(error, message) {
    logger.error("Erro ao atualizar o JARVIS:", error);
    publish({ status: "error", message });
  }

  function initialize() {
    if (updater) return updater;
    updater = getUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.logger = {
      info: (...args) => logger.log(...args),
      warn: (...args) => logger.warn(...args),
      error: (...args) => logger.error(...args),
      debug: (...args) => logger.log(...args),
    };
    updater.on("update-available", (info) => {
      downloaded = false;
      publish({ status: "available", availableVersion: info.version, progress: 0, message: null });
    });
    updater.on("update-not-available", () => {
      downloaded = false;
      publish({ status: "up-to-date", availableVersion: null, progress: 0, message: null });
    });
    updater.on("download-progress", (progress) => {
      publish({ status: "downloading", progress: Math.max(0, Math.min(100, progress.percent || 0)) });
    });
    updater.on("update-downloaded", (info) => {
      downloaded = true;
      publish({ status: "downloaded", availableVersion: info.version, progress: 100, message: null });
    });
    updater.on("error", (error) => {
      const message = state.status === "installing"
        ? "Não foi possível iniciar a instalação. Tente novamente."
        : state.status === "downloading"
          ? "Não foi possível baixar a atualização. Confira sua conexão e tente novamente."
          : "Não foi possível verificar atualizações. Confira sua conexão e tente novamente.";
      fail(error, message);
    });
    return updater;
  }

  function check() {
    if (checkPromise) return checkPromise;
    if (!active() || downloadPromise || downloaded || state.status === "installing") {
      return Promise.resolve(getState());
    }
    checkPromise = Promise.resolve().then(async () => {
      if (!active()) return getState();
      publish({ status: "checking", message: null });
      try {
        await initialize().checkForUpdates();
      } catch (error) {
        fail(error, "Não foi possível verificar atualizações. Confira sua conexão e tente novamente.");
      }
      return getState();
    }).finally(() => { checkPromise = null; });
    return checkPromise;
  }

  function download() {
    if (downloadPromise) return downloadPromise;
    if (!active() || !getState().canDownload || checkPromise) return Promise.resolve(getState());
    downloadPromise = Promise.resolve().then(async () => {
      if (!active()) return getState();
      publish({ status: "downloading", progress: 0, message: null });
      try {
        await initialize().downloadUpdate();
      } catch (error) {
        fail(error, "Não foi possível baixar a atualização. Confira sua conexão e tente novamente.");
      }
      return getState();
    }).finally(() => { downloadPromise = null; });
    return downloadPromise;
  }

  function install() {
    if (installPromise) return installPromise;
    if (!active() || !getState().canInstall) return Promise.resolve(getState());
    installPromise = Promise.resolve().then(async () => {
      try {
        if (await confirmInstall(state.availableVersion) && active()) {
          publish({ status: "installing", message: null });
          // The installer is owned by electron-updater, outside the profile's process manager.
          // Its app.quit() still runs the normal cleanup of profile apps, VPNs and helpers.
          initialize().quitAndInstall(false, true);
        }
      } catch (error) {
        fail(error, "Não foi possível iniciar a instalação. Tente novamente.");
      }
      return getState();
    }).finally(() => { installPromise = null; });
    return installPromise;
  }

  return {
    getState,
    check,
    download,
    install,
    start() {
      if (!active() || startupTimer || interval) return;
      startupTimer = setTimeout(() => { void check(); }, 10000);
      interval = setInterval(() => { void check(); }, automaticCheckInterval);
      startupTimer.unref?.();
      interval.unref?.();
    },
    dispose() {
      disposed = true;
      clearTimeout(startupTimer);
      clearInterval(interval);
    },
  };
}

module.exports = { createUpdateManager };

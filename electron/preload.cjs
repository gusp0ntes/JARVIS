const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "jarvis",
  {
    /*
    |--------------------------------------------------------------------------
    | JANELA
    |--------------------------------------------------------------------------
    */

    minimizeWindow: () =>
      ipcRenderer.invoke(
        "minimize-window"
      ),

    closeWindow: () =>
      ipcRenderer.invoke(
        "close-window"
      ),

    /*
    |--------------------------------------------------------------------------
    | CONFIG
    |--------------------------------------------------------------------------
    */

    getConfig: () =>
      ipcRenderer.invoke(
        "get-config"
      ),

    saveConfig: (config) =>
      ipcRenderer.invoke(
        "save-config",
        config
      ),

    getUpdateState: () => ipcRenderer.invoke("get-update-state"),
    checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
    downloadUpdate: () => ipcRenderer.invoke("download-update"),
    installUpdate: () => ipcRenderer.invoke("install-update"),
    onUpdateState: (callback) => {
      if (typeof callback !== "function") return () => {};
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("update-state", listener);
      return () => ipcRenderer.removeListener("update-state", listener);
    },

    /*
    |--------------------------------------------------------------------------
    | PROGRAMAS
    |--------------------------------------------------------------------------
    */

    launchProgram: (
      programPath
    ) =>
      ipcRenderer.invoke(
        "launch-program",
        programPath
      ),

    closeLaunchedProcesses: () =>
      ipcRenderer.invoke(
        "close-launched-processes"
      ),

    selectExecutable: () =>
      ipcRenderer.invoke(
        "select-executable"
      ),

    detectApplications: () =>
      ipcRenderer.invoke(
        "detect-applications"
      ),

    /*
    |--------------------------------------------------------------------------
    | NAVEGADOR
    |--------------------------------------------------------------------------
    */

    detectBrowsers: () =>
      ipcRenderer.invoke(
        "detect-browsers"
      ),

    launchBrowser: (
      browser
    ) =>
      ipcRenderer.invoke(
        "launch-browser",
        browser
      ),

    /*
    |--------------------------------------------------------------------------
    | VPN
    |--------------------------------------------------------------------------
    */

    detectVpn: () =>
      ipcRenderer.invoke(
        "detect-vpn"
      ),

    connectVpn: (
      vpnName
    ) =>
      ipcRenderer.invoke(
        "connect-vpn",
        vpnName
      ),

    disconnectVpn: (
      vpnName
    ) =>
      ipcRenderer.invoke(
        "disconnect-vpn",
        vpnName
      ),

    /*
    |--------------------------------------------------------------------------
    | NOTIFICAÇÕES
    |--------------------------------------------------------------------------
    */

    showNotification: (
      notification
    ) =>
      ipcRenderer.invoke(
        "show-notification",
        notification
      ),

    closeNotification: () =>
      ipcRenderer.invoke(
        "close-notification"
      ),

    onNotification: (
      callback
    ) => {
      if (
        typeof callback !==
        "function"
      ) {
        return () => {};
      }

      const listener = (
        _event,
        data
      ) => {
        callback(data);
      };

      ipcRenderer.on(
        "notification",
        listener
      );

      return () => {
        ipcRenderer.removeListener(
          "notification",
          listener
        );
      };
    },
  }
);

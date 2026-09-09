const {
  contextBridge,
  ipcRenderer,
} = require("electron");

contextBridge.exposeInMainWorld(
  "jarvis",
  {
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

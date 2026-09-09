const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  screen,
} = require("electron");

const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");

let mainWindow = null;
let notificationWindow = null;

let notificationReady = false;
let pendingNotification = null;

const notificationTimers = new Map();

/*
|--------------------------------------------------------------------------
| AMBIENTE
|--------------------------------------------------------------------------
*/

const isDev = !app.isPackaged;

if (isDev) {
  const devUserDataDirectory = path.join(
    __dirname,
    "..",
    ".jarvis-dev",
    "user-data"
  );

  fs.mkdirSync(devUserDataDirectory, {
    recursive: true,
  });

  app.setPath(
    "userData",
    devUserDataDirectory
  );

  app.commandLine.appendSwitch(
    "disk-cache-dir",
    path.join(
      devUserDataDirectory,
      "cache"
    )
  );
}

const rendererUrl = "http://localhost:5173";
const rendererOrigin = new URL(rendererUrl).origin;

const rendererIndex = path.join(
  app.getAppPath(),
  "dist",
  "index.html"
);

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO
|--------------------------------------------------------------------------
*/

const configDirectory = path.join(
  app.getPath("userData"),
  "JARVIS"
);

const configFile = path.join(
  configDirectory,
  "config.json"
);

const defaultConfig = {
  profile: {
    name: "Meu perfil",
    description: "Ambiente personalizado",
  },

  applications: [],

  browser: {
    enabled: false,
    name: "",
    path: "",
    url: "",
  },

  vpn: {
    enabled: false,
    name: "",
  },

  counterTime: {
    enabled: false,
    breakEnabled: true,

    schedule: {
      start: "08:00",
      lunchStart: "12:00",
      lunchEnd: "13:00",
      end: "17:00",
    },

    notifications: {
      enabled: true,
      sound: true,
      duration: 5,

      messages: {
        start: {
          title: "ROTINA INICIADA",
          message:
            "Sua rotina começou.",
        },

        lunchStart: {
          title: "HORA DA PAUSA",
          message:
            "Seu intervalo começou.",
        },

        lunchEnd: {
          title: "RETORNO DA PAUSA",
          message:
            "Seu intervalo terminou.",
        },

        end: {
          title: "ROTINA ENCERRADA",
          message:
            "A rotina configurada terminou.",
        },
      },
    },
  },
};

/*
|--------------------------------------------------------------------------
| PROCESSOS INICIADOS PELO JARVIS
|--------------------------------------------------------------------------
*/

const launchedProcesses = new Map();
const iconCache = new Map();

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeString(value, fallback = "", maxLength = 300) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.slice(0, maxLength);
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeDuration(value, fallback = 5) {
  const duration = Number(value);

  if (!Number.isFinite(duration)) {
    return fallback;
  }

  return Math.max(2, Math.min(Math.round(duration), 30));
}

function sanitizeTimeString(value, fallback) {
  const time = sanitizeString(value, fallback, 5);

  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
}

function isExecutablePath(value) {
  return typeof value === "string" && value.trim() && value.toLowerCase().endsWith(".exe");
}

function sanitizeApplication(value) {
  if (!isPlainObject(value) || !isExecutablePath(value.path)) {
    return null;
  }

  const applicationPath = sanitizeString(value.path, "", 1000);
  const executable = path.basename(
    sanitizeString(value.executable, path.basename(applicationPath), 260)
  );

  return {
    name: sanitizeString(value.name, path.basename(applicationPath, ".exe"), 120),
    executable,
    path: applicationPath,
    icon:
      typeof value.icon === "string" &&
      value.icon.startsWith("data:image/") &&
      value.icon.length < 150000
        ? value.icon
        : null,
  };
}

function sanitizeNotificationMessage(value, fallback) {
  const safeValue = isPlainObject(value) ? value : {};

  return {
    title: sanitizeString(safeValue.title, fallback.title, 80),
    message: sanitizeString(safeValue.message, fallback.message, 240),
  };
}

function sanitizeConfig(value) {
  const safeValue = isPlainObject(value) ? value : {};
  const safeProfile = isPlainObject(safeValue.profile) ? safeValue.profile : {};
  const safeBrowser = isPlainObject(safeValue.browser) ? safeValue.browser : {};
  const safeVpn = isPlainObject(safeValue.vpn) ? safeValue.vpn : {};
  const safeCounterTime = isPlainObject(safeValue.counterTime) ? safeValue.counterTime : {};
  const safeSchedule = isPlainObject(safeCounterTime.schedule) ? safeCounterTime.schedule : {};
  const safeNotifications = isPlainObject(safeCounterTime.notifications)
    ? safeCounterTime.notifications
    : {};
  const safeMessages = isPlainObject(safeNotifications.messages)
    ? safeNotifications.messages
    : {};

  const applications = Array.isArray(safeValue.applications)
    ? safeValue.applications.map(sanitizeApplication).filter(Boolean)
    : [];

  const browserPath = sanitizeString(safeBrowser.path, "", 1000);

  return {
    profile: {
      name: sanitizeString(safeProfile.name, defaultConfig.profile.name, 80),
      description: sanitizeString(
        safeProfile.description,
        defaultConfig.profile.description,
        160
      ),
    },

    applications,

    browser: {
      enabled: sanitizeBoolean(safeBrowser.enabled, defaultConfig.browser.enabled),
      name: sanitizeString(safeBrowser.name, defaultConfig.browser.name, 120),
      path: isExecutablePath(browserPath) ? browserPath : "",
      url: sanitizeString(safeBrowser.url, defaultConfig.browser.url, 2048),
    },

    vpn: {
      enabled: sanitizeBoolean(safeVpn.enabled, defaultConfig.vpn.enabled),
      name: sanitizeString(safeVpn.name, defaultConfig.vpn.name, 120).trim(),
    },

    counterTime: {
      enabled: sanitizeBoolean(safeCounterTime.enabled, defaultConfig.counterTime.enabled),
      breakEnabled: sanitizeBoolean(
        safeCounterTime.breakEnabled,
        defaultConfig.counterTime.breakEnabled
      ),
      schedule: {
        start: sanitizeTimeString(safeSchedule.start, defaultConfig.counterTime.schedule.start),
        lunchStart: sanitizeTimeString(
          safeSchedule.lunchStart,
          defaultConfig.counterTime.schedule.lunchStart
        ),
        lunchEnd: sanitizeTimeString(
          safeSchedule.lunchEnd,
          defaultConfig.counterTime.schedule.lunchEnd
        ),
        end: sanitizeTimeString(safeSchedule.end, defaultConfig.counterTime.schedule.end),
      },
      notifications: {
        enabled: sanitizeBoolean(
          safeNotifications.enabled,
          defaultConfig.counterTime.notifications.enabled
        ),
        sound: sanitizeBoolean(
          safeNotifications.sound,
          defaultConfig.counterTime.notifications.sound
        ),
        duration: sanitizeDuration(
          safeNotifications.duration,
          defaultConfig.counterTime.notifications.duration
        ),
        messages: {
          start: sanitizeNotificationMessage(
            safeMessages.start,
            defaultConfig.counterTime.notifications.messages.start
          ),
          lunchStart: sanitizeNotificationMessage(
            safeMessages.lunchStart,
            defaultConfig.counterTime.notifications.messages.lunchStart
          ),
          lunchEnd: sanitizeNotificationMessage(
            safeMessages.lunchEnd,
            defaultConfig.counterTime.notifications.messages.lunchEnd
          ),
          end: sanitizeNotificationMessage(
            safeMessages.end,
            defaultConfig.counterTime.notifications.messages.end
          ),
        },
      },
    },
  };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function requireExecutablePath(value) {
  const programPath = sanitizeString(value, "", 1000);

  if (!isExecutablePath(programPath)) {
    throw new Error("Informe um caminho de executável válido.");
  }

  return programPath;
}

function normalizeHttpUrl(value) {
  let url = sanitizeString(value, "", 2048).trim();

  if (!url) {
    throw new Error("A URL do navegador não foi configurada.");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error("A URL precisa usar HTTP ou HTTPS.");
  }

  return parsedUrl.toString();
}

function requireVpnName(value) {
  const vpnName = sanitizeString(value, "", 120).trim();

  if (!vpnName) {
    throw new Error("Nenhuma VPN selecionada.");
  }

  return vpnName;
}

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO
|--------------------------------------------------------------------------
*/

function ensureConfigDirectory() {
  if (!fs.existsSync(configDirectory)) {
    fs.mkdirSync(configDirectory, {
      recursive: true,
    });
  }
}

function mergeConfig(saved = {}) {
  return sanitizeConfig(saved);
}

function loadConfig() {
  try {
    ensureConfigDirectory();

    if (!fs.existsSync(configFile)) {
      return structuredClone(defaultConfig);
    }

    const raw = fs.readFileSync(
      configFile,
      "utf-8"
    );

    if (!raw.trim()) {
      return structuredClone(defaultConfig);
    }

    const saved = JSON.parse(raw);

    return mergeConfig(saved);
  } catch (error) {
    console.error(
      "Erro ao carregar configuração:",
      error
    );

    return structuredClone(defaultConfig);
  }
}

function saveConfig(config) {
  try {
    ensureConfigDirectory();

    const finalConfig =
      mergeConfig(config);

    fs.writeFileSync(
      configFile,
      JSON.stringify(
        finalConfig,
        null,
        2
      ),
      "utf-8"
    );

    scheduleCounterNotifications(
      finalConfig
    );

    return true;
  } catch (error) {
    console.error(
      "Erro ao salvar configuração:",
      error
    );

    throw new Error(
      "Não foi possível salvar as configurações."
    );
  }
}

/*
|--------------------------------------------------------------------------
| RENDERER
|--------------------------------------------------------------------------
*/

async function loadRenderer(
  window,
  hash = ""
) {
  if (isDev) {
    const url = hash
      ? `${rendererUrl}/#${hash}`
      : rendererUrl;

    await window.loadURL(url);

    return;
  }

  if (hash) {
    await window.loadFile(
      rendererIndex,
      {
        hash,
      }
    );

    return;
  }

  await window.loadFile(
    rendererIndex
  );
}

function isAllowedRendererUrl(navigationUrl) {
  try {
    const parsedUrl = new URL(navigationUrl);

    if (isDev) {
      return parsedUrl.origin === rendererOrigin;
    }

    return parsedUrl.protocol === "file:";
  } catch {
    return false;
  }
}

function hardenRendererWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({
    action: "deny",
  }));

  window.webContents.on(
    "will-navigate",
    (event, navigationUrl) => {
      if (!isAllowedRendererUrl(navigationUrl)) {
        event.preventDefault();
      }
    }
  );
}

/*
|--------------------------------------------------------------------------
| JANELA PRINCIPAL
|--------------------------------------------------------------------------
*/

function createWindow() {
  if (mainWindow) {
    return;
  }

  mainWindow = new BrowserWindow({
    width: 560,
    height: 760,

    minWidth: 560,
    minHeight: 760,

    resizable: true,

    frame: false,

    transparent: true,

    backgroundColor: "#00000000",

    show: false,

    webPreferences: {
      preload: path.join(
        __dirname,
        "preload.cjs"
      ),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: true,

      webSecurity: true,

      allowRunningInsecureContent: false,
    },
  });

  hardenRendererWindow(
    mainWindow
  );

  mainWindow.once(
    "ready-to-show",
    () => {
      if (
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        mainWindow.show();
      }
    }
  );

  loadRenderer(
    mainWindow
  ).catch((error) => {
    console.error(
      "Erro ao carregar JARVIS:",
      error
    );
  });

  mainWindow.on(
    "closed",
    () => {
      mainWindow = null;
    }
  );
}

/*
|--------------------------------------------------------------------------
| JANELA DE NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

function createNotificationWindow() {
  if (
    notificationWindow &&
    !notificationWindow.isDestroyed()
  ) {
    return;
  }

  notificationWindow = new BrowserWindow({
    width: 390,
    height: 170,

    frame: false,

    transparent: true,

    resizable: false,

    show: false,

    alwaysOnTop: true,

    skipTaskbar: true,

    focusable: false,

    hasShadow: false,

    backgroundColor: "#00000000",

    webPreferences: {
      preload: path.join(
        __dirname,
        "preload.cjs"
      ),

      contextIsolation: true,

      nodeIntegration: false,

      sandbox: true,

      webSecurity: true,

      allowRunningInsecureContent: false,
    },
  });

  hardenRendererWindow(
    notificationWindow
  );

  notificationWindow.setAlwaysOnTop(
    true,
    "floating"
  );

  notificationWindow.on(
    "closed",
    () => {
      notificationWindow = null;
      notificationReady = false;
    }
  );

  notificationWindow.webContents.on(
    "did-finish-load",
    () => {
      notificationReady = true;

      if (pendingNotification) {
        const notification =
          pendingNotification;

        pendingNotification = null;

        sendNotification(
          notification
        );
      }
    }
  );

  loadRenderer(
    notificationWindow,
    "notification"
  ).catch((error) => {
    console.error(
      "Erro ao carregar janela de notificação:",
      error
    );
  });
}

/*
|--------------------------------------------------------------------------
| POSICIONAR NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

function positionNotificationWindow() {
  if (
    !notificationWindow ||
    notificationWindow.isDestroyed()
  ) {
    return;
  }

  const display =
    screen.getPrimaryDisplay();

  const workArea =
    display.workArea;

  const bounds =
    notificationWindow.getBounds();

  const margin = 20;

  const x =
    workArea.x +
    workArea.width -
    bounds.width -
    margin;

  const y =
    workArea.y +
    workArea.height -
    bounds.height -
    margin;

  notificationWindow.setPosition(
    x,
    y,
    false
  );
}

/*
|--------------------------------------------------------------------------
| ENVIAR NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

function sendNotification(data) {
  if (
    !notificationWindow ||
    notificationWindow.isDestroyed()
  ) {
    return;
  }

  positionNotificationWindow();

  notificationWindow.showInactive();

  notificationWindow.webContents.send(
    "notification",
    data
  );
}

/*
|--------------------------------------------------------------------------
| MOSTRAR NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

function showJarvisNotification({
  type,
  title,
  message,
  duration = 5,
  sound = true,
}) {
  const data = {
    type: type || "info",

    title: title || "JARVIS",

    message: message || "",

    duration: Math.max(
      2,
      Math.min(
        Number(duration) || 5,
        30
      )
    ),

    sound: Boolean(sound),

    timestamp: Date.now(),
  };

  if (
    !notificationWindow ||
    notificationWindow.isDestroyed()
  ) {
    pendingNotification = data;

    createNotificationWindow();

    return;
  }

  if (!notificationReady) {
    pendingNotification = data;

    return;
  }

  sendNotification(data);
}

/*
|--------------------------------------------------------------------------
| IPC - TESTAR NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "show-notification",
  async (_, data) => {
    const safeData =
      isPlainObject(data)
        ? data
        : {};

    const config =
      loadConfig();

    const notifications =
      config.counterTime.notifications;

    showJarvisNotification({
      type:
        sanitizeString(
          safeData.type,
          "info",
          40
        ) ||
        "info",

      title:
        sanitizeString(
          safeData.title,
          "JARVIS",
          80
        ) ||
        "JARVIS",

      message:
        sanitizeString(
          safeData.message,
          "Notificação de teste.",
          240
        ) ||
        "Notificação de teste.",

      duration:
        sanitizeDuration(
          safeData.duration,
          notifications.duration
        ),

      sound:
        sanitizeBoolean(
          safeData.sound,
          notifications.sound
        ),
    });

    return true;
  }
);

/*
|--------------------------------------------------------------------------
| IPC - FECHAR NOTIFICAÇÃO
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "close-notification",
  async () => {
    if (
      notificationWindow &&
      !notificationWindow.isDestroyed()
    ) {
      notificationWindow.hide();
    }

    return true;
  }
);

/*
|--------------------------------------------------------------------------
| PROCESSOS
|--------------------------------------------------------------------------
*/

function launchProcess(
  programPath,
  args = [],
  key
) {
  return new Promise(
    (resolve, reject) => {
      if (!programPath) {
        reject(
          new Error(
            "Caminho do programa não informado."
          )
        );

        return;
      }

      if (!fs.existsSync(programPath)) {
        reject(
          new Error(
            `Programa não encontrado: ${programPath}`
          )
        );

        return;
      }

      let child;

      try {
        child = spawn(
          programPath,
          args,
          {
            detached: false,

            stdio: "ignore",

            windowsHide: true,
          }
        );
      } catch (error) {
        reject(error);

        return;
      }

      child.once(
        "spawn",
        () => {
          if (key) {
            launchedProcesses.set(
              key,
              {
                pid: child.pid,

                processName:
                  path.basename(
                    programPath
                  ),
              }
            );
          }

          resolve({
            success: true,

            pid: child.pid,
          });
        }
      );

      child.once(
        "error",
        (error) => {
          reject(error);
        }
      );

      child.once(
        "exit",
        () => {
          if (
            key &&
            launchedProcesses.has(key)
          ) {
            const process =
              launchedProcesses.get(
                key
              );

            if (
              process.pid ===
              child.pid
            ) {
              launchedProcesses.delete(
                key
              );
            }
          }
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| ABRIR PROGRAMA
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "launch-program",
  async (_, programPath) => {
    try {
      const safeProgramPath =
        requireExecutablePath(
          programPath
        );

      return await launchProcess(
        safeProgramPath,
        [],
        `app:${safeProgramPath}`
      );
    } catch (error) {
      console.error(
        "Erro ao abrir programa:",
        error
      );

      throw new Error(
        `Não foi possível abrir o programa: ${getErrorMessage(error)}`
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| FECHAR PROCESSO POR PID
|--------------------------------------------------------------------------
*/

function killProcessByPid(pid) {
  return new Promise(
    (resolve) => {
      const safePid =
        Number(pid);

      if (
        !Number.isInteger(safePid) ||
        safePid <= 0
      ) {
        resolve(false);

        return;
      }

      execFile(
        "taskkill",
        [
          "/PID",
          String(safePid),
          "/T",
          "/F",
        ],
        {
          windowsHide: true,
        },
        (error) => {
          resolve(!error);
        }
      );
    }
  );
}

ipcMain.handle(
  "close-launched-processes",
  async () => {
    const processes =
      Array.from(
        launchedProcesses.values()
      );

    launchedProcesses.clear();

    if (
      processes.length === 0
    ) {
      return true;
    }

    const results =
      await Promise.all(
        processes.map(
          (process) =>
            killProcessByPid(
              process.pid
            )
        )
      );

    return results.every(
      Boolean
    );
  }
);

/*
|--------------------------------------------------------------------------
| NAVEGADOR
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "launch-browser",
  async (_, browser) => {
    const safeBrowser =
      sanitizeConfig({
        browser,
      }).browser;

    if (!safeBrowser.path) {
      throw new Error(
        "O caminho do navegador não foi configurado."
      );
    }

    try {
      const url =
        normalizeHttpUrl(
          safeBrowser.url
        );

      return await launchProcess(
        safeBrowser.path,
        [url],
        "browser"
      );
    } catch (error) {
      console.error(
        "Erro ao abrir navegador:",
        error
      );

      throw new Error(
        `Não foi possível abrir o navegador: ${getErrorMessage(error)}`
      );
    }
  }
);

/*
|--------------------------------------------------------------------------
| DETECTAR NAVEGADORES
|--------------------------------------------------------------------------
*/

function getPossibleBrowserPaths() {
  const localAppData =
    process.env.LOCALAPPDATA ||
    "";

  const programFiles =
    process.env.ProgramFiles ||
    "";

  const programFilesX86 =
    process.env[
      "ProgramFiles(x86)"
    ] || "";

  return [
    {
      name: "Opera",

      paths: [
        path.join(
          localAppData,
          "Programs",
          "Opera",
          "opera.exe"
        ),

        path.join(
          localAppData,
          "Programs",
          "Opera GX",
          "opera.exe"
        ),

        path.join(
          programFiles,
          "Opera",
          "opera.exe"
        ),

        path.join(
          programFilesX86,
          "Opera",
          "opera.exe"
        ),
      ],
    },

    {
      name: "Google Chrome",

      paths: [
        path.join(
          programFiles,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe"
        ),

        path.join(
          programFilesX86,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe"
        ),

        path.join(
          localAppData,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe"
        ),
      ],
    },

    {
      name: "Microsoft Edge",

      paths: [
        path.join(
          programFiles,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe"
        ),

        path.join(
          programFilesX86,
          "Microsoft",
          "Edge",
          "Application",
          "msedge.exe"
        ),
      ],
    },

    {
      name: "Mozilla Firefox",

      paths: [
        path.join(
          programFiles,
          "Mozilla Firefox",
          "firefox.exe"
        ),

        path.join(
          programFilesX86,
          "Mozilla Firefox",
          "firefox.exe"
        ),
      ],
    },
  ];
}

ipcMain.handle(
  "detect-browsers",
  async () => {
    const browsers = [];

    for (
      const browser of
        getPossibleBrowserPaths()
    ) {
      for (
        const browserPath of
          browser.paths
      ) {
        if (
          fs.existsSync(
            browserPath
          )
        ) {
          browsers.push({
            name:
              browser.name,

            path:
              browserPath,
          });

          break;
        }
      }
    }

    return browsers;
  }
);

/*
|--------------------------------------------------------------------------
| SELECIONAR EXECUTÁVEL
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "select-executable",
  async () => {
    const result =
      await dialog.showOpenDialog(
        mainWindow,
        {
          title:
            "Selecionar aplicativo",

          properties: [
            "openFile",
          ],

          filters: [
            {
              name:
                "Aplicativos",

              extensions: [
                "exe",
              ],
            },
          ],
        }
      );

    if (
      result.canceled ||
      !result.filePaths.length
    ) {
      return null;
    }

    const selectedPath =
      result.filePaths[0];

    let icon = null;

    try {
      const nativeIcon =
        await app.getFileIcon(
          selectedPath,
          {
            size: "small",
          }
        );

      icon =
        nativeIcon.toDataURL();
    } catch {
      icon = null;
    }

    return {
      name:
        path.basename(
          selectedPath,
          ".exe"
        ),

      executable:
        path.basename(
          selectedPath
        ),

      path:
        selectedPath,

      icon,
    };
  }
);

/*
|--------------------------------------------------------------------------
| VPN
|--------------------------------------------------------------------------
*/

function escapePowerShellString(
  value
) {
  return String(
    value || ""
  ).replace(
    /'/g,
    "''"
  );
}

/*
|--------------------------------------------------------------------------
| DETECTAR VPN
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "detect-vpn",
  async () => {
    return new Promise(
      (resolve) => {
        const command = `
          $vpn = @()

          try {
            $vpn += Get-VpnConnection |
              Select-Object Name, ConnectionStatus, ConnectionType, TunnelType
          } catch {}

          try {
            $vpn += Get-VpnConnection -AllUserConnection |
              Select-Object Name, ConnectionStatus, ConnectionType, TunnelType
          } catch {}

          $vpn |
            Where-Object { $_.Name } |
            Sort-Object Name -Unique |
            ConvertTo-Json -Compress
        `;

        execFile(
          "powershell.exe",
          [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
          ],
          {
            windowsHide: true,
            encoding: "utf8",
          },
          (
            error,
            stdout,
            stderr
          ) => {
            if (
              stderr?.trim()
            ) {
              console.log(
                "VPN detection stderr:",
                stderr
              );
            }

            if (
              error ||
              !stdout?.trim()
            ) {
              resolve([]);

              return;
            }

            try {
              const parsed =
                JSON.parse(
                  stdout
                );

              const vpnList =
                Array.isArray(
                  parsed
                )
                  ? parsed
                  : [parsed];

              const uniqueVPNs =
                new Map();

              for (
                const vpn of
                  vpnList
              ) {
                if (
                  !vpn?.Name
                ) {
                  continue;
                }

                const key =
                  vpn.Name.toLowerCase();

                if (
                  !uniqueVPNs.has(
                    key
                  )
                ) {
                  uniqueVPNs.set(
                    key,
                    vpn
                  );
                }
              }

              resolve(
                Array.from(
                  uniqueVPNs.values()
                ).map(
                  (vpn) => ({
                    name:
                      vpn.Name,

                    status:
                      vpn.ConnectionStatus ||
                      "Disconnected",

                    connectionType:
                      vpn.ConnectionType ||
                      null,

                    tunnelType:
                      vpn.TunnelType ||
                      null,
                  })
                )
              );
            } catch {
              resolve([]);
            }
          }
        );
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| STATUS VPN
|--------------------------------------------------------------------------
*/

function getVpnStatus(
  vpnName
) {
  return new Promise(
    (resolve) => {
      const vpnNameValue =
        sanitizeString(
          vpnName,
          "",
          120
        ).trim();

      if (!vpnNameValue) {
        resolve(null);

        return;
      }

      const safeName =
        escapePowerShellString(
          vpnNameValue
        );

      const command = `
        $vpn = $null

        try {
          $vpn = Get-VpnConnection -Name '${safeName}' -ErrorAction Stop
        } catch {}

        if (-not $vpn) {
          try {
            $vpn = Get-VpnConnection -Name '${safeName}' -AllUserConnection -ErrorAction Stop
          } catch {}
        }

        if ($vpn) {
          $vpn.ConnectionStatus
        }
      `;

      execFile(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          command,
        ],
        {
          windowsHide: true,
          encoding: "utf8",
        },
        (
          error,
          stdout
        ) => {
          if (error) {
            resolve(null);

            return;
          }

          resolve(
            stdout?.trim() ||
              null
          );
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| ABRIR JANELA NATIVA DA VPN
|--------------------------------------------------------------------------
*/

function openWindowsVpnConnection(
  vpnName
) {
  return new Promise(
    (resolve, reject) => {
      let safeVpnName;

      try {
        safeVpnName =
          requireVpnName(
            vpnName
          );
      } catch (error) {
        reject(
          error
        );

        return;
      }

      console.log(
        `Abrindo janela nativa da VPN: ${safeVpnName}`
      );

      execFile(
        "rasphone.exe",
        [
          "-d",
          safeVpnName,
        ],
        {
          windowsHide: false,
        },
        (error) => {
          if (error) {
            console.error(
              "Erro ao abrir rasphone:",
              error
            );

            reject(
              new Error(
                `Não foi possível abrir a janela da VPN "${safeVpnName}": ${getErrorMessage(error)}`
              )
            );

            return;
          }

          resolve(true);
        }
      );
    }
  );
}

/*
|--------------------------------------------------------------------------
| CONECTAR VPN
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "connect-vpn",
  async (_, vpnName) => {
    const safeVpnName =
      requireVpnName(
        vpnName
      );

    const initialStatus =
      await getVpnStatus(
        safeVpnName
      );

    if (
      initialStatus &&
      initialStatus.toLowerCase() ===
        "connected"
    ) {
      return {
        success: true,

        connected: true,

        alreadyConnected: true,

        message:
          `VPN "${safeVpnName}" já está conectada.`,
      };
    }

    await openWindowsVpnConnection(
      safeVpnName
    );

    for (
      let attempt = 0;
      attempt < 120;
      attempt++
    ) {
      const status =
        await getVpnStatus(
          safeVpnName
        );

      if (
        status &&
        status.toLowerCase() ===
          "connected"
      ) {
        return {
          success: true,

          connected: true,

          alreadyConnected: false,

          message:
            `VPN "${safeVpnName}" conectada com sucesso.`,
        };
      }

      await new Promise(
        (resolveWait) =>
          setTimeout(
            resolveWait,
            1000
          )
      );
    }

    throw new Error(
      `A VPN "${safeVpnName}" não foi conectada dentro de 120 segundos.`
    );
  }
);

/*
|--------------------------------------------------------------------------
| DESCONECTAR VPN
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "disconnect-vpn",
  async (_, vpnName) => {
    const safeVpnName =
      sanitizeString(
        vpnName,
        "",
        120
      ).trim();

    if (!safeVpnName) {
      return {
        success: true,
        connected: false,
      };
    }

    return new Promise(
      (resolve) => {
        execFile(
          "rasdial.exe",
          [
            safeVpnName,
            "/disconnect",
          ],
          {
            windowsHide: true,
            encoding: "utf8",
          },
          async (
            error,
            stdout,
            stderr
          ) => {
            const output = [
              stdout?.trim(),
              stderr?.trim(),
            ]
              .filter(Boolean)
              .join("\n");

            await new Promise(
              (resolveWait) =>
                setTimeout(
                  resolveWait,
                  500
                )
            );

            resolve({
              success: true,

              connected: false,

              message:
                `VPN "${safeVpnName}" desconectada.`,

              output,
            });
          }
        );
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| APLICATIVOS DO MENU INICIAR
|--------------------------------------------------------------------------
*/

function getStartMenuDirectories() {
  return [
    path.join(
      process.env.ProgramData || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs"
    ),

    path.join(
      process.env.APPDATA || "",
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs"
    ),
  ];
}

function findShortcuts(
  directory
) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const results = [];

  function scan(
    currentDirectory
  ) {
    let entries;

    try {
      entries =
        fs.readdirSync(
          currentDirectory,
          {
            withFileTypes: true,
          }
        );
    } catch {
      return;
    }

    for (
      const entry of
        entries
    ) {
      const fullPath =
        path.join(
          currentDirectory,
          entry.name
        );

      if (
        entry.isDirectory()
      ) {
        scan(fullPath);

        continue;
      }

      if (
        entry.isFile() &&
        entry.name
          .toLowerCase()
          .endsWith(".lnk")
      ) {
        results.push(
          fullPath
        );
      }
    }
  }

  scan(directory);

  return results;
}

async function mapWithConcurrency(
  items,
  limit,
  mapper
) {
  const results =
    new Array(
      items.length
    );

  let index = 0;

  async function worker() {
    while (
      index < items.length
    ) {
      const currentIndex =
        index++;

      results[currentIndex] =
        await mapper(
          items[currentIndex],
          currentIndex
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          limit,
          items.length
        ),
      },
      worker
    )
  );

  return results;
}

async function getExecutableIcon(
  executablePath
) {
  if (
    iconCache.has(
      executablePath
    )
  ) {
    return iconCache.get(
      executablePath
    );
  }

  try {
    const nativeIcon =
      await app.getFileIcon(
        executablePath,
        {
          size: "small",
        }
      );

    const icon =
      nativeIcon.toDataURL();

    iconCache.set(
      executablePath,
      icon
    );

    return icon;
  } catch {
    iconCache.set(
      executablePath,
      null
    );

    return null;
  }
}

async function shortcutToApplication(
  shortcut
) {
  try {
    const shortcutData =
      shell.readShortcutLink(
        shortcut
      );

    const target =
      shortcutData.target;

    if (
      !isExecutablePath(
        target
      )
    ) {
      return null;
    }

    if (
      !fs.existsSync(target)
    ) {
      return null;
    }

    return {
      name:
        path.basename(
          shortcut,
          ".lnk"
        ),

      executable:
        path.basename(
          target
        ),

      path:
        target,

      icon:
        await getExecutableIcon(
          target
        ),
    };
  } catch {
    return null;
  }
}

function uniqueApplications(
  applications
) {
  const unique =
    new Map();

  for (
    const application of
      applications
  ) {
    if (!application) {
      continue;
    }

    const key =
      application.path.toLowerCase();

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        application
      );
    }
  }

  return Array.from(
    unique.values()
  ).sort(
    (a, b) =>
      a.name.localeCompare(
        b.name,
        "pt-BR"
      )
  );
}

/*
|--------------------------------------------------------------------------
| DETECTAR APLICATIVOS
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "detect-applications",
  async () => {
    const shortcuts = [];

    for (
      const directory of
        getStartMenuDirectories()
    ) {
      shortcuts.push(
        ...findShortcuts(
          directory
        )
      );
    }

    const applications =
      await mapWithConcurrency(
        shortcuts,
        8,
        shortcutToApplication
      );

    return uniqueApplications(
      applications
    );
  }
);

/*
|--------------------------------------------------------------------------
| COUNTER TIME
|--------------------------------------------------------------------------
*/

function clearCounterNotificationTimers() {
  for (
    const timer of
      notificationTimers.values()
  ) {
    clearTimeout(timer);
  }

  notificationTimers.clear();
}

function parseTimeString(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const match =
    value.match(
      /^(\d{2}):(\d{2})$/
    );

  if (!match) {
    return null;
  }

  const hours =
    Number(match[1]);

  const minutes =
    Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return {
    hours,
    minutes,
  };
}

function getNextTimeOccurrence(
  timeString
) {
  const parsed =
    parseTimeString(
      timeString
    );

  if (!parsed) {
    return null;
  }

  const now =
    new Date();

  const target =
    new Date();

  target.setHours(
    parsed.hours,
    parsed.minutes,
    0,
    0
  );

  if (
    target.getTime() <=
    now.getTime()
  ) {
    target.setDate(
      target.getDate() + 1
    );
  }

  return target;
}

function scheduleCounterNotification(
  eventKey,
  timeString,
  notificationConfig
) {
  const target =
    getNextTimeOccurrence(
      timeString
    );

  if (!target) {
    return;
  }

  const delay =
    target.getTime() -
    Date.now();

  const timer =
    setTimeout(
      () => {
        const messageConfig =
          notificationConfig?.messages?.[
            eventKey
          ];

        showJarvisNotification({
          type:
            eventKey,

          title:
            messageConfig?.title ||
            "JARVIS",

          message:
            messageConfig?.message ||
            "",

          duration:
            notificationConfig.duration,

          sound:
            notificationConfig.sound,
        });

        scheduleCounterNotification(
          eventKey,
          timeString,
          notificationConfig
        );
      },

      Math.max(
        1000,
        delay
      )
    );

  notificationTimers.set(
    eventKey,
    timer
  );
}

function scheduleCounterNotifications(
  config
) {
  clearCounterNotificationTimers();

  if (
    !config?.counterTime?.enabled
  ) {
    return;
  }

  const notifications =
    config
      .counterTime
      .notifications;

  if (
    !notifications?.enabled
  ) {
    return;
  }

  const schedule =
    config
      .counterTime
      .schedule;

  scheduleCounterNotification(
    "start",
    schedule.start,
    notifications
  );

  if (
    config.counterTime.breakEnabled
  ) {
    scheduleCounterNotification(
      "lunchStart",
      schedule.lunchStart,
      notifications
    );

    scheduleCounterNotification(
      "lunchEnd",
      schedule.lunchEnd,
      notifications
    );
  }

  scheduleCounterNotification(
    "end",
    schedule.end,
    notifications
  );
}

/*
|--------------------------------------------------------------------------
| CONFIG IPC
|--------------------------------------------------------------------------
*/

ipcMain.handle(
  "get-config",
  async () => {
    return loadConfig();
  }
);

ipcMain.handle(
  "save-config",
  async (_, config) => {
    return saveConfig(
      config
    );
  }
);

/*
|--------------------------------------------------------------------------
| ELECTRON
|--------------------------------------------------------------------------
*/

app.whenReady().then(() => {
  createWindow();

  const config =
    loadConfig();

  scheduleCounterNotifications(
    config
  );

  app.on(
    "activate",
    () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {
        createWindow();
      }
    }
  );
});

/*
|--------------------------------------------------------------------------
| ENCERRAMENTO
|--------------------------------------------------------------------------
*/

app.on(
  "before-quit",
  () => {
    clearCounterNotificationTimers();

    launchedProcesses.clear();
  }
);

app.on(
  "window-all-closed",
  () => {
    clearCounterNotificationTimers();

    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);

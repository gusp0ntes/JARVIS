import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Check, Minus, Settings as SettingsIcon, X as XIcon } from "lucide-react";

import "./App.css";

import { cloneDefaultConfig, normalizeConfig } from "./config";
import { CounterTime } from "./components/CounterTime";
import { IconButton } from "./components/IconButton";
import { NotificationWindow } from "./components/NotificationWindow";
import { SettingsPanel } from "./components/SettingsPanel";
import { validateCounterSchedule } from "./time";
import type {
  Application,
  AppearanceConfig,
  BrowserConfig,
  CounterEventKey,
  CounterSchedule,
  DetectedBrowser,
  DetectedVPN,
  JarvisConfig,
  NotificationMessage,
  ProfileConfig,
} from "./types";

interface RunIssue {
  target: string;
  message: string;
}

function hexToRgb(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff";

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixColors(color: string, base: string, amount: number) {
  const colorRgb = hexToRgb(color);
  const baseRgb = hexToRgb(base);

  return rgbToHex({
    r: colorRgb.r * amount + baseRgb.r * (1 - amount),
    g: colorRgb.g * amount + baseRgb.g * (1 - amount),
    b: colorRgb.b * amount + baseRgb.b * (1 - amount),
  });
}

function getReadableTextColor(color: string) {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.64 ? "#111111" : "#ffffff";
}

function createAppearanceStyle(appearance: AppearanceConfig) {
  const primary = appearance.primaryColor;
  const secondary = appearance.secondaryColor;
  const primaryRgb = hexToRgb(primary);
  const secondaryRgb = hexToRgb(secondary);
  const surfaceStart = mixColors(primary, "#151515", 0.18);
  const surfaceEnd =
    appearance.mode === "gradient" ? mixColors(secondary, "#0b0b0b", 0.2) : "#0b0b0b";
  const panelEnd =
    appearance.mode === "gradient" ? mixColors(secondary, "#090909", 0.16) : "#090909";

  return {
    "--jarvis-accent": primary,
    "--jarvis-accent-2": secondary,
    "--jarvis-accent-rgb": `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`,
    "--jarvis-accent-2-rgb": `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}`,
    "--jarvis-accent-text": getReadableTextColor(primary),
    "--jarvis-surface-start": surfaceStart,
    "--jarvis-surface-end": surfaceEnd,
    "--jarvis-panel-start": mixColors(primary, "#151515", 0.12),
    "--jarvis-panel-end": panelEnd,
  } as CSSProperties;
}

function JarvisApp() {
  const [enabled, setEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [detectedApplications, setDetectedApplications] = useState<Application[]>([]);
  const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>([]);
  const [detectedVPNs, setDetectedVPNs] = useState<DetectedVPN[]>([]);
  const [detectingApplications, setDetectingApplications] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [runIssues, setRunIssues] = useState<RunIssue[]>([]);
  const [config, setConfig] = useState<JarvisConfig>(cloneDefaultConfig());

  async function loadConfig() {
    try {
      const saved = normalizeConfig(await window.jarvis.getConfig());

      setConfig(saved);
      setApplications(saved.applications || []);
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
    }
  }

  async function detectApplications() {
    setDetectingApplications(true);

    try {
      const detected = await window.jarvis.detectApplications();

      setDetectedApplications(detected);
    } catch (error) {
      console.error("Erro ao detectar aplicativos:", error);
    } finally {
      setDetectingApplications(false);
    }
  }

  async function detectBrowsers() {
    try {
      const browsers = await window.jarvis.detectBrowsers();

      setDetectedBrowsers(browsers);

      setConfig((current) => {
        if (current.browser.path || browsers.length === 0) {
          return current;
        }

        const preferredBrowser =
          browsers.find((browser) => browser.name === "Opera") || browsers[0];

        return {
          ...current,
          browser: {
            ...current.browser,
            name: preferredBrowser.name,
            path: preferredBrowser.path,
          },
        };
      });
    } catch (error) {
      console.error("Erro ao detectar navegadores:", error);
    }
  }

  async function detectVPNs() {
    try {
      const vpns = await window.jarvis.detectVpn();

      setDetectedVPNs(vpns);
    } catch (error) {
      console.error("Erro ao detectar VPNs:", error);
    }
  }

  async function openSettings() {
    setSettingsOpen(true);

    await Promise.all([detectApplications(), detectBrowsers(), detectVPNs()]);
  }

  async function minimizeWindow() {
    try {
      await window.jarvis.minimizeWindow();
    } catch (error) {
      console.error("Erro ao minimizar janela:", error);
    }
  }

  async function closeWindow() {
    if (closing) {
      return;
    }

    const confirmed = window.confirm(
      enabled || loading
        ? "Ao fechar o JARVIS, os processos iniciados por este perfil serão encerrados e a VPN configurada será desconectada. Deseja continuar?"
        : "Deseja fechar o JARVIS?",
    );

    if (!confirmed) {
      return;
    }

    setClosing(true);

    try {
      if (enabled || loading) {
        await stopProfileEnvironment();
      }

      const closed = await window.jarvis.closeWindow();

      if (!closed) {
        throw new Error("A janela principal não pôde ser fechada.");
      }
    } catch (error) {
      console.error("Erro ao fechar janela:", error);
      alert(`Não foi possível fechar o JARVIS.\n\n${getErrorMessage(error)}`);
      setClosing(false);
    }
  }

  async function saveSettings() {
    setSaving(true);

    try {
      const finalConfig = normalizeConfig({
        ...config,
        applications,
      });

      await window.jarvis.saveConfig(finalConfig);

      setConfig(finalConfig);
      setSettingsOpen(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  function addApplication(application: Application) {
    setApplications((current) => {
      const exists = current.some(
        (item) => item.path.toLowerCase() === application.path.toLowerCase(),
      );

      return exists ? current : [...current, application];
    });
  }

  async function addManualApplication() {
    try {
      const application = await window.jarvis.selectExecutable();

      if (application) {
        addApplication(application);
      }
    } catch (error) {
      console.error("Erro ao selecionar aplicativo:", error);
    }
  }

  function removeApplication(applicationPath: string) {
    setApplications((current) =>
      current.filter((application) => application.path !== applicationPath),
    );
  }

  function updateBrowser(partial: Partial<BrowserConfig>) {
    setConfig((current) => ({
      ...current,
      browser: {
        ...current.browser,
        ...partial,
      },
    }));
  }

  function updateProfile(profile: Partial<ProfileConfig>) {
    setConfig((current) => ({
      ...current,
      profile: {
        ...current.profile,
        ...profile,
      },
    }));
  }

  function updateAppearance(appearance: Partial<AppearanceConfig>) {
    setConfig((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...appearance,
      },
    }));
  }

  function changeBrowser(browserPath: string) {
    const browser = detectedBrowsers.find((item) => item.path === browserPath);

    updateBrowser({
      name: browser?.name || "",
      path: browserPath,
    });
  }

  function updateVpn(partial: Partial<JarvisConfig["vpn"]>) {
    setConfig((current) => ({
      ...current,
      vpn: {
        ...current.vpn,
        ...partial,
      },
    }));
  }

  function updateCounterTime(partial: Partial<JarvisConfig["counterTime"]>) {
    setConfig((current) => ({
      ...current,
      counterTime: {
        ...current.counterTime,
        ...partial,
      },
    }));
  }

  function updateSchedule(field: keyof CounterSchedule, value: string) {
    setConfig((current) => ({
      ...current,
      counterTime: {
        ...current.counterTime,
        schedule: {
          ...current.counterTime.schedule,
          [field]: value,
        },
      },
    }));
  }

  function updateNotifications(partial: Partial<JarvisConfig["counterTime"]["notifications"]>) {
    setConfig((current) => ({
      ...current,
      counterTime: {
        ...current.counterTime,
        notifications: {
          ...current.counterTime.notifications,
          ...partial,
        },
      },
    }));
  }

  function updateNotificationMessage(type: CounterEventKey, value: NotificationMessage) {
    setConfig((current) => ({
      ...current,
      counterTime: {
        ...current.counterTime,
        notifications: {
          ...current.counterTime.notifications,
          messages: {
            ...current.counterTime.notifications.messages,
            [type]: value,
          },
        },
      },
    }));
  }

  async function testNotification(type: CounterEventKey) {
    const message = config.counterTime.notifications.messages[type];

    try {
      await window.jarvis.showNotification({
        type,
        title: message.title,
        message: message.message,
        duration: config.counterTime.notifications.duration,
        sound: config.counterTime.notifications.sound,
      });
    } catch (error) {
      console.error("Erro ao testar notificação:", error);
    }
  }

  async function launchProfileEnvironment() {
    const issues: RunIssue[] = [];
    let attempted = 0;
    let succeeded = 0;

    if (config.browser.enabled && config.browser.path && config.browser.url) {
      attempted++;

      try {
        const result = await window.jarvis.launchBrowser(config.browser);

        if (result.success) {
          succeeded++;
        }
      } catch (error) {
        console.error("Erro ao abrir navegador:", error);
        issues.push({
          target: config.browser.name || "Navegador",
          message: getErrorMessage(error),
        });
      }
    }

    for (const application of applications) {
      attempted++;

      try {
        const result = await window.jarvis.launchProgram(application.path);

        if (result.success) {
          succeeded++;
        }
      } catch (error) {
        console.error(`Erro ao abrir ${application.name}:`, error);
        issues.push({
          target: application.name,
          message: getErrorMessage(error),
        });
      }
    }

    return {
      attempted,
      succeeded,
      issues,
    };
  }

  async function stopProfileEnvironment() {
    setStatusMessage("ENCERRANDO PERFIL");

    const stopIssues: RunIssue[] = [];

    try {
      const closed = await window.jarvis.closeLaunchedProcesses();

      if (!closed) {
        stopIssues.push({
          target: "Processos",
          message: "Alguns processos já haviam sido encerrados ou não puderam ser fechados.",
        });
      }
    } catch (error) {
      console.error("Erro ao fechar processos iniciados:", error);
      stopIssues.push({
        target: "Processos",
        message: getErrorMessage(error),
      });
    }

    if (config.vpn.enabled && config.vpn.name) {
      try {
        await window.jarvis.disconnectVpn(config.vpn.name);
      } catch (error) {
        console.error("Erro ao desconectar VPN:", error);
        stopIssues.push({
          target: "VPN",
          message: getErrorMessage(error),
        });
      }
    }

    setEnabled(false);
    setRunIssues(stopIssues);
    setStatusMessage(
      stopIssues.length > 0 ? "PERFIL DESATIVADO COM AVISOS" : "PERFIL DESATIVADO",
    );

    return stopIssues;
  }

  function getStartupValidationIssues() {
    const issues: RunIssue[] = [];

    if (config.browser.enabled) {
      if (!config.browser.path.trim()) {
        issues.push({
          target: "Navegador",
          message: "Selecione um navegador para este perfil.",
        });
      }

      if (!config.browser.url.trim()) {
        issues.push({
          target: "Navegador",
          message: "Informe a URL inicial do navegador.",
        });
      }
    }

    if (config.vpn.enabled && !config.vpn.name.trim()) {
      issues.push({
        target: "VPN",
        message: "Selecione uma conexão VPN para este perfil.",
      });
    }

    if (config.counterTime.enabled) {
      const validation = validateCounterSchedule(
        config.counterTime.schedule,
        config.counterTime.breakEnabled,
      );

      if (!validation.valid) {
        issues.push({
          target: "Rotina",
          message: validation.message,
        });
      }
    }

    return issues;
  }

  async function toggleJarvis() {
    if (loading || closing) {
      return;
    }

    if (
      !enabled &&
      applications.length === 0 &&
      !config.browser.enabled &&
      !config.vpn.enabled &&
      !config.counterTime.enabled
    ) {
      await openSettings();
      return;
    }

    if (!enabled) {
      const validationIssues = getStartupValidationIssues();

      if (validationIssues.length > 0) {
        setRunIssues(validationIssues);
        setStatusMessage("AJUSTE A CONFIGURAÇÃO");
        await openSettings();
        return;
      }
    }

    setLoading(true);

    if (!enabled) {
      try {
        setRunIssues([]);
        let vpnConnected = false;

        if (config.vpn.enabled && config.vpn.name) {
          setStatusMessage("CONECTE A VPN PELO WINDOWS");

          const result = await window.jarvis.connectVpn(config.vpn.name);

          if (!result || !result.success || !result.connected) {
            throw new Error("A VPN não foi conectada.");
          }

          setStatusMessage("VPN CONECTADA - INICIANDO PERFIL");
          vpnConnected = true;
        }

        const launchReport = await launchProfileEnvironment();
        const hasUsableRoutine = config.counterTime.enabled;
        const profileStarted =
          vpnConnected || launchReport.succeeded > 0 || hasUsableRoutine;

        if (launchReport.issues.length > 0 && !profileStarted) {
          throw new Error(launchReport.issues[0].message);
        }

        setEnabled(true);
        setRunIssues(launchReport.issues);
        setStatusMessage(
          launchReport.issues.length > 0 ? "PERFIL ATIVO COM AVISOS" : "PERFIL ATIVO",
        );
      } catch (error) {
        console.error("Erro ao iniciar JARVIS:", error);

        const message = error instanceof Error ? error.message : String(error);

        setRunIssues([
          {
            target: "Inicialização",
            message,
          },
        ]);

        alert(`Não foi possível iniciar o perfil.\n\n${message}`);

        setEnabled(false);
        setStatusMessage("PERFIL DESATIVADO");
      } finally {
        setLoading(false);
      }

      return;
    }

    try {
      await stopProfileEnvironment();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  const statusText = closing
    ? "FECHANDO JARVIS"
    : loading
      ? config.vpn.enabled && !enabled
        ? "AGUARDANDO VPN"
        : "INICIANDO"
      : statusMessage || (enabled ? "PERFIL ATIVO" : "PERFIL DESATIVADO");

  const profileName = config.profile.name.trim() || "Meu perfil";
  const profileDescription = config.profile.description.trim() || "Ambiente personalizado";
  const appearanceStyle = createAppearanceStyle(config.appearance);

  return (
    <main className="jarvis" style={appearanceStyle}>
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="title">JARVIS</span>
        </div>

        <div className="window-controls">
          <IconButton
            className="window-button"
            onClick={() => {
              void minimizeWindow();
            }}
            label="Minimizar janela"
            icon={<Minus size={18} strokeWidth={2.2} aria-hidden="true" />}
          />

          <IconButton
            className="window-button close-window-button"
            onClick={() => {
              void closeWindow();
            }}
            disabled={closing}
            label="Fechar janela"
            icon={<XIcon size={18} strokeWidth={2.4} aria-hidden="true" />}
          />

          <IconButton
            className="settings-button"
            onClick={openSettings}
            label="Configurações"
            icon={<SettingsIcon size={18} strokeWidth={2.1} aria-hidden="true" />}
          />
        </div>
      </header>

      <section className="content">
        <div className="mode">
          <span className="mode-label">PERFIL ATUAL</span>
          <h1>{profileName.toUpperCase()}</h1>
          <span className="mode-description">{profileDescription}</span>
        </div>

        <button
          className={`toggle ${enabled ? "active" : ""}`}
          onClick={toggleJarvis}
          disabled={loading || closing}
        >
          <span className="toggle-circle">
            {enabled ? <Check size={18} strokeWidth={2.8} aria-hidden="true" /> : null}
          </span>
        </button>

        <div className={`status ${enabled ? "active" : ""}`}>
          <span className="status-dot" />
          {statusText}
        </div>

        {runIssues.length > 0 && (
          <div className="run-report">
            <strong>Avisos</strong>

            {runIssues.slice(0, 3).map((issue) => (
              <span key={`${issue.target}-${issue.message}`}>
                {issue.target}: {issue.message}
              </span>
            ))}
          </div>
        )}

        <div className="summary">
          <div>
            <strong>{applications.length}</strong>
            <span>aplicativos</span>
          </div>

          <div>
            <strong>{config.browser.enabled ? "ON" : "OFF"}</strong>
            <span>navegador</span>
          </div>

          <div>
            <strong>{config.vpn.enabled ? "ON" : "OFF"}</strong>
            <span>VPN</span>
          </div>
        </div>

        <CounterTime config={config} />
      </section>

      {settingsOpen && (
        <SettingsPanel
          applications={applications}
          config={config}
          detectedApplications={detectedApplications}
          detectedBrowsers={detectedBrowsers}
          detectedVPNs={detectedVPNs}
          detectingApplications={detectingApplications}
          closing={closing}
          saving={saving}
          onAddApplication={addApplication}
          onAddManualApplication={addManualApplication}
          onBrowserChange={changeBrowser}
          onBrowserEnabledChange={(enabled) => updateBrowser({ enabled })}
          onBrowserUrlChange={(url) => updateBrowser({ url })}
          onClose={() => setSettingsOpen(false)}
          onCounterBreakEnabledChange={(breakEnabled) => updateCounterTime({ breakEnabled })}
          onCounterEnabledChange={(enabled) => updateCounterTime({ enabled })}
          onDetectApplications={detectApplications}
          onDetectVPNs={detectVPNs}
          onNotificationDurationChange={(duration) => updateNotifications({ duration })}
          onNotificationMessageChange={updateNotificationMessage}
          onNotificationSoundChange={(sound) => updateNotifications({ sound })}
          onNotificationsEnabledChange={(enabled) => updateNotifications({ enabled })}
          onAppearanceChange={updateAppearance}
          onCloseWindow={closeWindow}
          onMinimizeWindow={minimizeWindow}
          onProfileChange={updateProfile}
          onRemoveApplication={removeApplication}
          onSave={saveSettings}
          onScheduleChange={updateSchedule}
          onTestNotification={testNotification}
          onVpnEnabledChange={(enabled) => updateVpn({ enabled })}
          onVpnNameChange={(name) => updateVpn({ name })}
        />
      )}
    </main>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function App() {
  if (window.location.hash === "#notification") {
    return <NotificationWindow />;
  }

  return <JarvisApp />;
}

export default App;

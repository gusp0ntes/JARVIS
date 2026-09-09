import { useEffect, useState } from "react";

import "./App.css";

import { cloneDefaultConfig, normalizeConfig } from "./config";
import { CounterTime } from "./components/CounterTime";
import { NotificationWindow } from "./components/NotificationWindow";
import { SettingsPanel } from "./components/SettingsPanel";
import { validateCounterSchedule } from "./time";
import type {
  Application,
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

function JarvisApp() {
  const [enabled, setEnabled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
    if (loading) {
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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  const statusText = loading
    ? config.vpn.enabled && !enabled
      ? "AGUARDANDO VPN"
      : "INICIANDO"
    : statusMessage || (enabled ? "PERFIL ATIVO" : "PERFIL DESATIVADO");

  const profileName = config.profile.name.trim() || "Meu perfil";
  const profileDescription = config.profile.description.trim() || "Ambiente personalizado";

  return (
    <main className="jarvis">
      <header className="header">
        <div className="brand">
          <span className="brand-dot" />
          <span className="title">JARVIS</span>
        </div>

        <button className="settings-button" onClick={openSettings} aria-label="Configurações">
          ⚙
        </button>
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
          disabled={loading}
        >
          <span className="toggle-circle">{enabled ? "✓" : ""}</span>
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

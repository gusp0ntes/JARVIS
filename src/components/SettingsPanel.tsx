import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X as XIcon,
} from "lucide-react";

import type {
  Application,
  AppearanceConfig,
  CounterEventKey,
  CounterSchedule,
  DetectedBrowser,
  DetectedVPN,
  JarvisConfig,
  NotificationMessage,
  ProfileConfig,
} from "../types";
import { validateCounterSchedule } from "../time";
import { IconButton } from "./IconButton";
import { NotificationMessageEditor } from "./NotificationMessageEditor";
import { ToggleSwitch } from "./ToggleSwitch";

const notificationEditors: Array<{
  key: CounterEventKey;
  label: string;
}> = [
    { key: "start", label: "Início da rotina" },
    { key: "lunchStart", label: "Início da pausa" },
    { key: "lunchEnd", label: "Retorno da pausa" },
    { key: "end", label: "Fim da rotina" },
  ];

const appearancePresets: Array<AppearanceConfig & { name: string }> = [
  {
    name: "Clássico",
    mode: "solid",
    primaryColor: "#ffffff",
    secondaryColor: "#38bdf8",
  },
  {
    name: "Ciano",
    mode: "gradient",
    primaryColor: "#22d3ee",
    secondaryColor: "#0ea5e9",
  },
  {
    name: "Esmeralda",
    mode: "gradient",
    primaryColor: "#34d399",
    secondaryColor: "#14b8a6",
  },
  {
    name: "Âmbar",
    mode: "solid",
    primaryColor: "#f59e0b",
    secondaryColor: "#f97316",
  },
  {
    name: "Rosa",
    mode: "gradient",
    primaryColor: "#fb7185",
    secondaryColor: "#a855f7",
  },
];

type SettingsSectionKey =
  | "profile"
  | "applications"
  | "browser"
  | "vpn"
  | "routine"
  | "notifications";

const sectionKeys: SettingsSectionKey[] = [
  "profile",
  "applications",
  "browser",
  "vpn",
  "routine",
  "notifications",
];

function createExpandedSections(expanded: boolean): Record<SettingsSectionKey, boolean> {
  return {
    profile: expanded,
    applications: expanded,
    browser: expanded,
    vpn: expanded,
    routine: expanded,
    notifications: expanded,
  };
}

interface SectionHeaderProps {
  actions?: ReactNode;
  expanded: boolean;
  id: string;
  number: string;
  onToggle: () => void;
  title: string;
}

function SectionHeader({
  actions,
  expanded,
  id,
  number,
  onToggle,
  title,
}: SectionHeaderProps) {
  return (
    <div className="card-heading">
      <button
        className="card-title-button"
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={id}
      >
        <span className="card-eyebrow">{number}</span>
        <span className="card-title">{title}</span>
      </button>

      <div className="card-heading-actions">
        {actions}

        <IconButton
          className={`expand-button ${expanded ? "open" : ""}`}
          onClick={onToggle}
          label={`${expanded ? "Recolher" : "Expandir"} ${title}`}
          aria-expanded={expanded}
          aria-controls={id}
          icon={
            <ChevronDown
              className="expand-icon"
              size={15}
              strokeWidth={2.5}
              aria-hidden="true"
            />
          }
        />
      </div>
    </div>
  );
}

interface SettingsPanelProps {
  applications: Application[];
  config: JarvisConfig;
  detectedApplications: Application[];
  detectedBrowsers: DetectedBrowser[];
  detectedVPNs: DetectedVPN[];
  detectingApplications: boolean;
  closing: boolean;
  saving: boolean;
  onAddApplication: (application: Application) => void;
  onAddManualApplication: () => void | Promise<void>;
  onBrowserChange: (browserPath: string) => void;
  onBrowserEnabledChange: (enabled: boolean) => void;
  onBrowserUrlChange: (url: string) => void;
  onClose: () => void;
  onCounterBreakEnabledChange: (breakEnabled: boolean) => void;
  onCounterEnabledChange: (enabled: boolean) => void;
  onDetectApplications: () => void | Promise<void>;
  onDetectVPNs: () => void | Promise<void>;
  onNotificationDurationChange: (duration: number) => void;
  onNotificationMessageChange: (type: CounterEventKey, value: NotificationMessage) => void;
  onNotificationSoundChange: (sound: boolean) => void;
  onNotificationsEnabledChange: (enabled: boolean) => void;
  onAppearanceChange: (appearance: Partial<AppearanceConfig>) => void;
  onCloseWindow: () => void | Promise<void>;
  onMinimizeWindow: () => void | Promise<void>;
  onProfileChange: (profile: Partial<ProfileConfig>) => void;
  onRemoveApplication: (applicationPath: string) => void;
  onSave: () => void | Promise<void>;
  onScheduleChange: (field: keyof CounterSchedule, value: string) => void;
  onTestNotification: (type: CounterEventKey) => void | Promise<void>;
  onVpnEnabledChange: (enabled: boolean) => void;
  onVpnNameChange: (name: string) => void;
}

export function SettingsPanel({
  applications,
  config,
  detectedApplications,
  detectedBrowsers,
  detectedVPNs,
  detectingApplications,
  closing,
  saving,
  onAddApplication,
  onAddManualApplication,
  onBrowserChange,
  onBrowserEnabledChange,
  onBrowserUrlChange,
  onClose,
  onCounterBreakEnabledChange,
  onCounterEnabledChange,
  onDetectApplications,
  onDetectVPNs,
  onNotificationDurationChange,
  onNotificationMessageChange,
  onNotificationSoundChange,
  onNotificationsEnabledChange,
  onAppearanceChange,
  onCloseWindow,
  onMinimizeWindow,
  onProfileChange,
  onRemoveApplication,
  onSave,
  onScheduleChange,
  onTestNotification,
  onVpnEnabledChange,
  onVpnNameChange,
}: SettingsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<
    Record<SettingsSectionKey, boolean>
  >(() => createExpandedSections(true));
  const scheduleValidation = validateCounterSchedule(
    config.counterTime.schedule,
    config.counterTime.breakEnabled,
  );
  const saveDisabled = saving || (config.counterTime.enabled && !scheduleValidation.valid);
  const activeNotificationEditors = notificationEditors.filter(
    (editor) =>
      config.counterTime.breakEnabled || editor.key === "start" || editor.key === "end",
  );
  const allSectionsExpanded = sectionKeys.every((section) => expandedSections[section]);

  function toggleSection(section: SettingsSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function setAllSectionsExpanded(expanded: boolean) {
    setExpandedSections(createExpandedSections(expanded));
  }

  return (
    <section className="settings">
      <div className="settings-top">
        <div>
          <span className="settings-eyebrow">JARVIS</span>
          <h2>Configurações</h2>
        </div>

        <div className="settings-actions">
          <IconButton
            className="expand-all-button"
            onClick={() => setAllSectionsExpanded(!allSectionsExpanded)}
            label={allSectionsExpanded ? "Recolher tudo" : "Expandir tudo"}
            icon={
              allSectionsExpanded ? (
                <ChevronsUp size={17} strokeWidth={2.3} aria-hidden="true" />
              ) : (
                <ChevronsDown size={17} strokeWidth={2.3} aria-hidden="true" />
              )
            }
          />

          <IconButton
            className="window-button"
            onClick={() => {
              void onMinimizeWindow();
            }}
            label="Minimizar janela"
            icon={<Minus size={18} strokeWidth={2.2} aria-hidden="true" />}
          />

          <IconButton
            className="window-button close-window-button"
            onClick={() => {
              void onCloseWindow();
            }}
            disabled={closing}
            label="Fechar JARVIS"
            icon={<XIcon size={18} strokeWidth={2.4} aria-hidden="true" />}
          />

          <IconButton
            className="close-button"
            onClick={onClose}
            label="Voltar"
            icon={<ArrowLeft size={18} strokeWidth={2.3} aria-hidden="true" />}
          />
        </div>
      </div>

      <div className="settings-content">
        <section className={`config-card ${expandedSections.profile ? "expanded" : "collapsed"}`}>
          <SectionHeader
            expanded={expandedSections.profile}
            id="settings-section-profile"
            number="01"
            onToggle={() => toggleSection("profile")}
            title="Perfil"
          />

          <div
            className="config-card-body"
            id="settings-section-profile"
            hidden={!expandedSections.profile}
          >
            <p className="card-description">
              Nomeie este ambiente para qualquer contexto: estudo, foco, atendimento, live ou rotina
              pessoal.
            </p>

            <label className="field-label">Nome do perfil</label>

            <input
              className="field"
              type="text"
              placeholder="Meu perfil"
              value={config.profile.name}
              onChange={(event) => onProfileChange({ name: event.target.value })}
            />

            <label className="field-label">Descrição curta</label>

            <input
              className="field"
              type="text"
              placeholder="Ambiente personalizado"
              value={config.profile.description}
              onChange={(event) => onProfileChange({ description: event.target.value })}
            />

            <div className="profile-appearance">
              <label className="field-label">Visual do Jarvis</label>

              <p className="card-description">
                Personalize a cor principal do JARVIS com uma base sólida ou um gradiente.
              </p>

              <div
                className="appearance-preview"
                style={{
                  background:
                    config.appearance.mode === "gradient"
                      ? `linear-gradient(135deg, ${config.appearance.primaryColor}, ${config.appearance.secondaryColor})`
                      : config.appearance.primaryColor,
                }}
              >
                <span>JARVIS</span>
              </div>

              <div className="appearance-mode-control">
                <button
                  className={config.appearance.mode === "solid" ? "active" : ""}
                  onClick={() => onAppearanceChange({ mode: "solid" })}
                >
                  Sólida
                </button>

                <button
                  className={config.appearance.mode === "gradient" ? "active" : ""}
                  onClick={() => onAppearanceChange({ mode: "gradient" })}
                >
                  Gradiente
                </button>
              </div>

              <div className="color-grid">
                <label className="color-field">
                  <span>Cor principal</span>

                  <input
                    type="color"
                    value={config.appearance.primaryColor}
                    onChange={(event) =>
                      onAppearanceChange({
                        primaryColor: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="color-field">
                  <span>Cor secundária</span>

                  <input
                    type="color"
                    value={config.appearance.secondaryColor}
                    onChange={(event) =>
                      onAppearanceChange({
                        secondaryColor: event.target.value,
                        mode: "gradient",
                      })
                    }
                  />
                </label>
              </div>

              <div className="preset-swatches">
                {appearancePresets.map((preset) => {
                  const selected =
                    config.appearance.mode === preset.mode &&
                    config.appearance.primaryColor === preset.primaryColor &&
                    config.appearance.secondaryColor === preset.secondaryColor;

                  return (
                    <button
                      className={selected ? "active" : ""}
                      key={preset.name}
                      onClick={() =>
                        onAppearanceChange({
                          mode: preset.mode,
                          primaryColor: preset.primaryColor,
                          secondaryColor: preset.secondaryColor,
                        })
                      }
                      title={preset.name}
                      aria-label={`Usar preset ${preset.name}`}
                      style={{
                        background:
                          preset.mode === "gradient"
                            ? `linear-gradient(135deg, ${preset.primaryColor}, ${preset.secondaryColor})`
                            : preset.primaryColor,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section
          className={`config-card ${expandedSections.applications ? "expanded" : "collapsed"}`}
        >
          <SectionHeader
            actions={<span className="counter">{applications.length}</span>}
            expanded={expandedSections.applications}
            id="settings-section-applications"
            number="02"
            onToggle={() => toggleSection("applications")}
            title="Aplicativos"
          />

          <div
            className="config-card-body"
            id="settings-section-applications"
            hidden={!expandedSections.applications}
          >
            <p className="card-description">
              Aplicativos iniciados quando este perfil for ativado.
            </p>

            <div className="application-list">
              {applications.length === 0 ? (
                <div className="empty">Nenhum aplicativo configurado.</div>
              ) : (
                applications.map((application) => (
                  <div className="application" key={application.path}>
                    <div className="application-info">
                      {application.icon ? (
                        <img src={application.icon} className="application-icon" alt="" />
                      ) : (
                        <div className="application-icon-placeholder">APP</div>
                      )}

                      <div className="application-text">
                        <strong>{application.name}</strong>
                        <small>{application.executable}</small>
                      </div>
                    </div>

                    <IconButton
                      className="remove-button"
                      onClick={() => onRemoveApplication(application.path)}
                      label={`Remover ${application.name}`}
                      icon={<Trash2 size={15} strokeWidth={2.2} aria-hidden="true" />}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="application-actions">
              <IconButton
                className="secondary-button"
                onClick={() => {
                  void onAddManualApplication();
                }}
                label="Adicionar aplicativo"
                icon={<Plus size={17} strokeWidth={2.4} aria-hidden="true" />}
              />

              <IconButton
                className={`secondary-button ${detectingApplications ? "loading" : ""}`}
                onClick={() => {
                  void onDetectApplications();
                }}
                disabled={detectingApplications}
                label={
                  detectingApplications ? "Procurando aplicativos" : "Detectar aplicativos"
                }
                icon={
                  detectingApplications ? (
                    <LoaderCircle
                      className="button-spinner"
                      size={17}
                      strokeWidth={2.4}
                      aria-hidden="true"
                    />
                  ) : (
                    <Search size={17} strokeWidth={2.4} aria-hidden="true" />
                  )
                }
              />
            </div>

            {detectedApplications.length > 0 && (
              <div className="detected">
                <div className="detected-title">Aplicativos encontrados</div>

                <div className="detected-list">
                  {detectedApplications.map((application) => {
                    const exists = applications.some(
                      (item) => item.path.toLowerCase() === application.path.toLowerCase(),
                    );

                    return (
                      <button
                        className="detected-item"
                        key={application.path}
                        disabled={exists}
                        onClick={() => onAddApplication(application)}
                      >
                        {application.icon && <img src={application.icon} alt="" />}
                        <span>{application.name}</span>
                        <strong aria-hidden="true">
                          {exists ? (
                            <Check size={14} strokeWidth={2.5} />
                          ) : (
                            <Plus size={14} strokeWidth={2.5} />
                          )}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className={`config-card ${expandedSections.browser ? "expanded" : "collapsed"}`}>
          <SectionHeader
            actions={
              <ToggleSwitch
                checked={config.browser.enabled}
                label="Ativar navegador"
                onChange={onBrowserEnabledChange}
              />
            }
            expanded={expandedSections.browser}
            id="settings-section-browser"
            number="03"
            onToggle={() => toggleSection("browser")}
            title="Navegador"
          />

          <div
            className="config-card-body"
            id="settings-section-browser"
            hidden={!expandedSections.browser}
          >
            <p className="card-description">
              Abra automaticamente um navegador e uma URL ao iniciar.
            </p>

            <label className="field-label">Navegador</label>

            <select
              className="field"
              value={config.browser.path}
              onChange={(event) => onBrowserChange(event.target.value)}
            >
              <option value="">Selecionar navegador</option>

              {detectedBrowsers.map((browser) => (
                <option key={browser.path} value={browser.path}>
                  {browser.name}
                </option>
              ))}
            </select>

            <label className="field-label">URL de inicialização</label>

            <input
              className="field"
              type="text"
              placeholder="https://exemplo.com"
              value={config.browser.url}
              onChange={(event) => onBrowserUrlChange(event.target.value)}
            />

            {config.browser.path && <div className="path-preview">{config.browser.path}</div>}
          </div>
        </section>

        <section className={`config-card ${expandedSections.vpn ? "expanded" : "collapsed"}`}>
          <SectionHeader
            actions={
              <ToggleSwitch
                checked={config.vpn.enabled}
                label="Ativar VPN"
                onChange={onVpnEnabledChange}
              />
            }
            expanded={expandedSections.vpn}
            id="settings-section-vpn"
            number="04"
            onToggle={() => toggleSection("vpn")}
            title="VPN"
          />

          <div
            className="config-card-body"
            id="settings-section-vpn"
            hidden={!expandedSections.vpn}
          >
            <p className="card-description">
              Abra a janela de conexão da VPN do Windows antes de iniciar o perfil.
            </p>

            <label className="field-label">Conexão VPN</label>

            <select
              className="field"
              value={config.vpn.name}
              onChange={(event) => onVpnNameChange(event.target.value)}
            >
              <option value="">Selecionar VPN</option>

              {detectedVPNs.map((vpn) => (
                <option key={vpn.name} value={vpn.name}>
                  {vpn.name}
                </option>
              ))}
            </select>

            <IconButton
              className="secondary-button full"
              onClick={() => {
                void onDetectVPNs();
              }}
              label="Atualizar VPNs"
              icon={<RefreshCw size={17} strokeWidth={2.4} aria-hidden="true" />}
            />
          </div>
        </section>

        <section className={`config-card ${expandedSections.routine ? "expanded" : "collapsed"}`}>
          <SectionHeader
            actions={
              <ToggleSwitch
                checked={config.counterTime.enabled}
                label="Ativar rotina"
                onChange={onCounterEnabledChange}
              />
            }
            expanded={expandedSections.routine}
            id="settings-section-routine"
            number="05"
            onToggle={() => toggleSection("routine")}
            title="Rotina"
          />

          <div
            className="config-card-body"
            id="settings-section-routine"
            hidden={!expandedSections.routine}
          >
            <p className="card-description">
              Configure horários opcionais para acompanhar qualquer rotina com início, pausa, retorno
              e fim.
            </p>

            <div className="notification-option">
              <div>
                <strong>Pausa intermediária</strong>
                <span>Use quando a rotina tiver um intervalo no meio.</span>
              </div>

              <ToggleSwitch
                checked={config.counterTime.breakEnabled}
                label="Ativar pausa intermediária"
                onChange={onCounterBreakEnabledChange}
              />
            </div>

            <div className="schedule-grid">
              <div>
                <label className="field-label">Início</label>
                <input
                  className="field"
                  type="time"
                  value={config.counterTime.schedule.start}
                  onChange={(event) => onScheduleChange("start", event.target.value)}
                />
              </div>

              {config.counterTime.breakEnabled && (
                <>
                  <div>
                    <label className="field-label">Pausa</label>
                    <input
                      className="field"
                      type="time"
                      value={config.counterTime.schedule.lunchStart}
                      onChange={(event) => onScheduleChange("lunchStart", event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label">Retorno</label>
                    <input
                      className="field"
                      type="time"
                      value={config.counterTime.schedule.lunchEnd}
                      onChange={(event) => onScheduleChange("lunchEnd", event.target.value)}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="field-label">Fim</label>
                <input
                  className="field"
                  type="time"
                  value={config.counterTime.schedule.end}
                  onChange={(event) => onScheduleChange("end", event.target.value)}
                />
              </div>
            </div>

            <div className="schedule-preview">
              <span>{config.counterTime.schedule.start}</span>

              {config.counterTime.breakEnabled && (
                <>
                  <i />
                  <span>{config.counterTime.schedule.lunchStart}</span>
                  <i />
                  <span>{config.counterTime.schedule.lunchEnd}</span>
                </>
              )}

              <i />
              <span>{config.counterTime.schedule.end}</span>
            </div>

            {config.counterTime.enabled && !scheduleValidation.valid && (
              <div className="field-warning">{scheduleValidation.message}</div>
            )}
          </div>
        </section>

        <section
          className={`config-card ${expandedSections.notifications ? "expanded" : "collapsed"}`}
        >
          <SectionHeader
            actions={
              <ToggleSwitch
                checked={config.counterTime.notifications.enabled}
                label="Ativar notificações"
                onChange={onNotificationsEnabledChange}
              />
            }
            expanded={expandedSections.notifications}
            id="settings-section-notifications"
            number="06"
            onToggle={() => toggleSection("notifications")}
            title="Notificações"
          />

          <div
            className="config-card-body"
            id="settings-section-notifications"
            hidden={!expandedSections.notifications}
          >
            <p className="card-description">Alertas personalizados para cada etapa da rotina.</p>

            <div className="notification-options">
              <div className="notification-option">
                <div>
                  <strong>Som</strong>
                  <span>Reproduzir um aviso sonoro.</span>
                </div>

                <ToggleSwitch
                  checked={config.counterTime.notifications.sound}
                  label="Ativar som das notificações"
                  onChange={onNotificationSoundChange}
                />
              </div>
            </div>

            <label className="field-label">Duração da notificação</label>

            <select
              className="field"
              value={config.counterTime.notifications.duration}
              onChange={(event) => onNotificationDurationChange(Number(event.target.value))}
            >
              <option value={3}>3 segundos</option>
              <option value={5}>5 segundos</option>
              <option value={7}>7 segundos</option>
              <option value={10}>10 segundos</option>
            </select>

            <div className="message-config">
              {activeNotificationEditors.map((editor) => (
                <NotificationMessageEditor
                  key={editor.key}
                  label={editor.label}
                  value={config.counterTime.notifications.messages[editor.key]}
                  onChange={(value) => onNotificationMessageChange(editor.key, value)}
                  onTest={() => {
                    void onTestNotification(editor.key);
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        <IconButton
          className="cancel-button"
          onClick={onClose}
          label="Cancelar"
          icon={<XIcon size={18} strokeWidth={2.3} aria-hidden="true" />}
        />

        <IconButton

          className="save-button"
          onClick={() => {
            void onSave();
          }}

          disabled={saveDisabled}
          label={saving ? "Salvando configurações" : "Salvar configurações"}

          icon={
            saving ? (
              <>
                <LoaderCircle
                  className="button-spinner"
                  size={18}
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
                <span>Salvando</span>
              </>
            ) : (
              <>
                <Save size={18} strokeWidth={2.3} aria-hidden="true" />
                <span>Salvar</span>
              </>
            )
          }
        />
      </div>
    </section>
  );
}

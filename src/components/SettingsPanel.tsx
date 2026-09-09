import type {
  Application,
  CounterEventKey,
  CounterSchedule,
  DetectedBrowser,
  DetectedVPN,
  JarvisConfig,
  NotificationMessage,
  ProfileConfig,
} from "../types";
import { validateCounterSchedule } from "../time";
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

interface SettingsPanelProps {
  applications: Application[];
  config: JarvisConfig;
  detectedApplications: Application[];
  detectedBrowsers: DetectedBrowser[];
  detectedVPNs: DetectedVPN[];
  detectingApplications: boolean;
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
  onProfileChange,
  onRemoveApplication,
  onSave,
  onScheduleChange,
  onTestNotification,
  onVpnEnabledChange,
  onVpnNameChange,
}: SettingsPanelProps) {
  const scheduleValidation = validateCounterSchedule(
    config.counterTime.schedule,
    config.counterTime.breakEnabled,
  );
  const saveDisabled = saving || (config.counterTime.enabled && !scheduleValidation.valid);
  const activeNotificationEditors = notificationEditors.filter(
    (editor) =>
      config.counterTime.breakEnabled || editor.key === "start" || editor.key === "end",
  );

  return (
    <section className="settings">
      <div className="settings-top">
        <div>
          <span className="settings-eyebrow">JARVIS</span>
          <h2>Configurações</h2>
        </div>

        <button className="close-button" onClick={onClose}>
          ×
        </button>
      </div>

      <div className="settings-content">
        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">01</span>
              <h3>Perfil</h3>
            </div>
          </div>

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
        </section>

        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">02</span>
              <h3>Aplicativos</h3>
            </div>

            <span className="counter">{applications.length}</span>
          </div>

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

                  <button
                    className="remove-button"
                    onClick={() => onRemoveApplication(application.path)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="application-actions">
            <button
              className="secondary-button"
              onClick={() => {
                void onAddManualApplication();
              }}
            >
              + Adicionar aplicativo
            </button>

            <button
              className="secondary-button"
              onClick={() => {
                void onDetectApplications();
              }}
              disabled={detectingApplications}
            >
              {detectingApplications ? "Procurando..." : "Detectar aplicativos"}
            </button>
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
                      <strong>{exists ? "✓" : "+"}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">03</span>
              <h3>Navegador</h3>
            </div>

            <ToggleSwitch
              checked={config.browser.enabled}
              label="Ativar navegador"
              onChange={onBrowserEnabledChange}
            />
          </div>

          <p className="card-description">Abra automaticamente um navegador e uma URL ao iniciar.</p>

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
        </section>

        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">04</span>
              <h3>VPN</h3>
            </div>

            <ToggleSwitch
              checked={config.vpn.enabled}
              label="Ativar VPN"
              onChange={onVpnEnabledChange}
            />
          </div>

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

          <button
            className="secondary-button full"
            onClick={() => {
              void onDetectVPNs();
            }}
          >
            Atualizar VPNs
          </button>
        </section>

        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">05</span>
              <h3>Rotina</h3>
            </div>

            <ToggleSwitch
              checked={config.counterTime.enabled}
              label="Ativar rotina"
              onChange={onCounterEnabledChange}
            />
          </div>

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
        </section>

        <section className="config-card">
          <div className="card-heading">
            <div>
              <span className="card-eyebrow">06</span>
              <h3>Notificações</h3>
            </div>

            <ToggleSwitch
              checked={config.counterTime.notifications.enabled}
              label="Ativar notificações"
              onChange={onNotificationsEnabledChange}
            />
          </div>

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
        </section>
      </div>

      <div className="settings-footer">
        <button className="cancel-button" onClick={onClose}>
          Cancelar
        </button>

        <button
          className="save-button"
          onClick={() => {
            void onSave();
          }}
          disabled={saveDisabled}
        >
          {saving ? "Salvando..." : "Salvar configurações"}
        </button>
      </div>
    </section>
  );
}

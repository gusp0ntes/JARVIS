import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import type { UpdateState } from "../types";

interface UpdateNoticeProps {
  state: UpdateState;
  busy: boolean;
  onCheck: () => Promise<void>;
  onDownload: () => Promise<void>;
  onInstall: () => Promise<void>;
  onDismiss: () => void;
}

export function UpdateNotice({ state, busy, onCheck, onDownload, onInstall, onDismiss }: UpdateNoticeProps) {
  const downloading = state.status === "downloading";
  const installing = state.status === "installing";
  const title = state.status === "available"
    ? "Há uma nova versão do JARVIS disponível!"
    : state.status === "downloaded"
      ? "Atualização pronta para instalar"
      : downloading ? "Baixando atualização"
        : installing ? "Reiniciando para atualizar"
          : state.status === "up-to-date" ? "Seu JARVIS está atualizado"
            : "Não foi possível concluir a atualização";
  const description = state.message || (
    state.status === "up-to-date" ? `Você está usando a versão ${state.currentVersion}.`
      : downloading ? `Versão ${state.availableVersion} · ${Math.floor(state.progress)}%`
        : installing ? "Aguarde o encerramento dos aplicativos e da VPN do perfil."
          : state.canInstall ? `A versão ${state.availableVersion} foi baixada. Reinicie quando puder.`
            : `A versão ${state.availableVersion} está pronta para baixar.`
  );

  return (
    <aside className="update-notice" aria-labelledby="update-notice-title">
      <div role="status" aria-live="polite">
        <strong id="update-notice-title">{title}</strong>
        <p>{description}</p>
      </div>

      {downloading && (
        <progress className="update-progress" value={state.progress} max={100} aria-label="Download da atualização" />
      )}

      <div className="update-actions">
        {!downloading && !installing && (
          <button className="update-later" type="button" onClick={onDismiss}>
            {state.status === "up-to-date" || state.status === "error" ? "Fechar" : "Depois"}
          </button>
        )}

        {state.canDownload && (
          <button className="update-primary" type="button" disabled={busy} onClick={() => { void onDownload(); }}>
            <Download size={15} aria-hidden="true" />
            {state.status === "error" ? "Tentar baixar novamente" : "Atualizar agora"}
          </button>
        )}

        {state.canInstall && (
          <button className="update-primary" type="button" disabled={busy} onClick={() => { void onInstall(); }}>
            <RefreshCw size={15} aria-hidden="true" />
            Reiniciar e instalar
          </button>
        )}

        {state.status === "error" && !state.canDownload && !state.canInstall && (
          <button className="update-primary" type="button" disabled={busy} onClick={() => { void onCheck(); }}>
            Tentar novamente
          </button>
        )}

        {(downloading || installing) && <LoaderCircle className="button-spinner" size={17} aria-hidden="true" />}
      </div>
    </aside>
  );
}

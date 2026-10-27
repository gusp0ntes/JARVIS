import { useEffect, useState } from "react";
import type { UpdateState } from "./types";

export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.jarvis.onUpdateState((value) => {
      receivedEvent = true;
      if (active) setState(value);
    });
    void window.jarvis.getUpdateState().then((value) => {
      if (active && !receivedEvent) setState(value);
    }).catch((error) => console.error("Erro ao consultar atualizações:", error));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function run(action: "checkForUpdates" | "downloadUpdate" | "installUpdate") {
    setManual(true);
    setDismissed(null);
    try {
      setState(await window.jarvis[action]());
    } catch (error) {
      console.error("Erro na atualização:", error);
      setState((current) => current && ({
        ...current,
        status: "error",
        message: "Não foi possível atualizar o JARVIS. Tente novamente.",
      }));
    }
  }

  const noticeKey = `${state?.availableVersion}:${state?.status}`;
  const visible = Boolean(state && noticeKey !== dismissed && (
    ["available", "downloading", "downloaded", "installing"].includes(state.status)
    || (state.status === "error" && (manual || state.availableVersion))
    || (state.status === "up-to-date" && manual)
  ));

  return {
    state,
    visible,
    dismiss: () => { setDismissed(noticeKey); setManual(false); },
    check: () => run("checkForUpdates"),
    download: () => run("downloadUpdate"),
    install: () => run("installUpdate"),
  };
}

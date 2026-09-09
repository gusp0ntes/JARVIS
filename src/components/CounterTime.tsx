import { useEffect, useMemo, useState } from "react";

import type { JarvisConfig } from "../types";
import { formatDuration, getCounterSnapshot, getCurrentSeconds } from "../time";

interface CounterTimeProps {
  config: JarvisConfig;
}

export function CounterTime({ config }: CounterTimeProps) {
  const [now, setNow] = useState(getCurrentSeconds());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(getCurrentSeconds());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const counter = useMemo(
    () =>
      getCounterSnapshot(
        config.counterTime.schedule,
        now,
        config.counterTime.breakEnabled,
      ),
    [config.counterTime.breakEnabled, config.counterTime.schedule, now],
  );

  if (!config.counterTime.enabled) {
    return (
      <div className="counter-time disabled">
        <div className="counter-header">
          <div>
            <span className="counter-label">ROTINA</span>
            <strong>DESATIVADO</strong>
          </div>

          <span className="counter-state">OFF</span>
        </div>
      </div>
    );
  }

  const counterState =
    counter.state === "lunch" ? "PAUSA" : counter.state === "finished" ? "FIM" : "ATIVO";

  return (
    <div className={`counter-time state-${counter.state}`}>
      <div className="counter-header">
        <div>
          <span className="counter-label">ROTINA</span>
          <strong>{counter.label}</strong>
        </div>

        <span className="counter-state">{counterState}</span>
      </div>

      <div className="counter-display">
        {formatDuration(counter.remaining)
          .split("")
          .map((character, index) => (
            <span
              className={character === ":" ? "counter-separator" : "counter-digit"}
              key={`${character}-${index}`}
            >
              {character}
            </span>
          ))}
      </div>

      <div className="counter-progress">
        <span style={{ width: `${counter.progress}%` }} />
      </div>

      <div className="counter-footer">
        <span>PRÓXIMO</span>
        <strong>{counter.next}</strong>
      </div>
    </div>
  );
}

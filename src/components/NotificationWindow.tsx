import { useEffect, useRef, useState } from "react";

import type { NotificationData } from "../types";

export function NotificationWindow() {
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [visible, setVisible] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  function clearNotificationTimers() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }

    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }

  function dismissNotification(delay = 300) {
    clearNotificationTimers();
    setVisible(false);

    hideTimer.current = window.setTimeout(() => {
      window.jarvis.closeNotification();
    }, delay);
  }

  useEffect(() => {
    const unsubscribe = window.jarvis.onNotification((data) => {
      clearNotificationTimers();
      setNotification(data);
      setVisible(false);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });

      if (data.sound) {
        playNotificationSound();
      }

      closeTimer.current = window.setTimeout(() => {
        dismissNotification(400);
      }, data.duration * 1000);
    });

    return () => {
      clearNotificationTimers();
      unsubscribe();
    };
  }, []);

  if (!notification) {
    return null;
  }

  return (
    <div className={`notification-shell ${visible ? "notification-visible" : ""}`}>
      <div className="notification-card">
        <div className="notification-top">
          <div className="notification-brand">
            <span className="notification-brand-dot" />
            <span>JARVIS</span>
          </div>

          <span className="notification-time">
            {new Date(notification.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div className="notification-body">
          <div className={`notification-icon notification-${notification.type}`}>
            {getNotificationIcon(notification.type)}
          </div>

          <div className="notification-copy">
            <span className="notification-eyebrow">ROTINA PROGRAMADA</span>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
          </div>

          <button className="notification-close" onClick={() => dismissNotification()}>
            ×
          </button>
        </div>

        <div className="notification-progress">
          <span style={{ animationDuration: `${notification.duration}s` }} />
        </div>
      </div>
    </div>
  );
}

function getNotificationIcon(type: string) {
  switch (type) {
    case "start":
      return "↗";
    case "lunchStart":
      return "●";
    case "lunchEnd":
      return "↻";
    case "end":
      return "✓";
    default:
      return "•";
  }
}

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 620;

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);

    oscillator.onended = () => {
      context.close();
    };
  } catch {
    // Audio feedback is optional.
  }
}

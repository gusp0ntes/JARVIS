import { BellRing } from "lucide-react";

import { IconButton } from "./IconButton";
import type { NotificationMessage } from "../types";

interface NotificationMessageEditorProps {
  label: string;
  value: NotificationMessage;
  onChange: (value: NotificationMessage) => void;
  onTest: () => void;
}

export function NotificationMessageEditor({
  label,
  value,
  onChange,
  onTest,
}: NotificationMessageEditorProps) {
  return (
    <div className="message-editor">
      <div className="message-editor-top">
        <label>{label}</label>

        <IconButton
          className="test-notification-button"
          onClick={onTest}
          label={`Testar ${label}`}
          icon={<BellRing size={14} strokeWidth={2.3} aria-hidden="true" />}
        />
      </div>

      <input
        className="field"
        type="text"
        value={value.title}
        onChange={(event) => onChange({ ...value, title: event.target.value })}
        placeholder="Título"
      />

      <input
        className="field message-input"
        type="text"
        value={value.message}
        onChange={(event) => onChange({ ...value, message: event.target.value })}
        placeholder="Mensagem"
      />
    </div>
  );
}

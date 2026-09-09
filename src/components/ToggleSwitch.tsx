interface ToggleSwitchProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({ checked, label, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      className={`state-toggle ${checked ? "active" : ""}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      {checked ? "ON" : "OFF"}
    </button>
  );
}

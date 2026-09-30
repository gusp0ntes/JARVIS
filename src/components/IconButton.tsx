import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
}

export function IconButton({
  icon,
  label,
  title,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button {...buttonProps} type={type} aria-label={label} title={title ?? label}>
      {icon}
    </button>
  );
}

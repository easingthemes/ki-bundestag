// Reusable UI components for consistent styling

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";

// Button Component
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "success" | "danger" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size !== "md" && `btn-${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && <span className="loading-spinner" />}
      {children}
    </button>
  );
}

// Input Component
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  help?: string;
}

export function Input({ label, error, help, className = "", ...props }: InputProps) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <input className={`form-control ${className}`} {...props} />
      {error && <div className="form-error">{error}</div>}
      {help && !error && <div className="form-help">{help}</div>}
    </div>
  );
}

// Select Component
interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  help?: string;
  options: { value: string | number; label: string }[];
}

export function Select({
  label,
  error,
  help,
  options,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <select className={`form-control ${className}`} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div className="form-error">{error}</div>}
      {help && !error && <div className="form-help">{help}</div>}
    </div>
  );
}

// Textarea Component
interface TextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  help?: string;
}

export function Textarea({ label, error, help, className = "", ...props }: TextareaProps) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea className={`form-control ${className}`} {...(props as any)} />
      {error && <div className="form-error">{error}</div>}
      {help && !error && <div className="form-help">{help}</div>}
    </div>
  );
}

// Loading Spinner Component
export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: 16, md: 24, lg: 32 };
  const style = { width: sizes[size], height: sizes[size] };
  return <div className="loading-spinner" style={style} />;
}

// Skeleton Loader Components
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" />
      ))}
    </>
  );
}

export function SkeletonCard() {
  return <div className="skeleton skeleton-card" />;
}

export function SkeletonTitle() {
  return <div className="skeleton skeleton-title" />;
}

// Show More Button Component
interface ShowMoreButtonProps {
  total: number;
  visible: number;
  increment?: number;
  onShowMore: () => void;
  label?: string;
}

export function ShowMoreButton({ total, visible, increment = 10, onShowMore, label }: ShowMoreButtonProps) {
  const remaining = total - visible;
  if (remaining <= 0) return null;
  const next = Math.min(increment, remaining);
  return (
    <div className="show-more-wrap">
      <button className="show-more-btn" onClick={onShowMore}>
        {label || `Show ${next} more`} ({remaining} remaining)
      </button>
    </div>
  );
}

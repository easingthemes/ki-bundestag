// App-level wrappers over shadcn/ui primitives + domain-specific components

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button as ShadButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, UserRound, Landmark } from "lucide-react";

// ── Button ──────────────────────────────────────────────────────────
// Maps our app's variant names to shadcn variants + adds loading prop.

const VARIANT_MAP = {
  primary: "default",
  secondary: "secondary",
  success: "default",      // custom green override via className
  danger: "destructive",
  outline: "outline",
  ghost: "ghost",
} as const;

const SIZE_MAP = {
  sm: "sm",
  md: "default",
  lg: "lg",
} as const;

interface ButtonProps extends React.ComponentProps<"button"> {
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
  className,
  disabled,
  ...props
}: ButtonProps) {
  const extraClasses = variant === "success" ? "bg-[#28a745] hover:bg-[#218838] text-white" : "";

  return (
    <ShadButton
      variant={VARIANT_MAP[variant]}
      size={SIZE_MAP[size]}
      disabled={disabled || loading}
      className={cn(extraClasses, className)}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {children}
    </ShadButton>
  );
}

// ── Skeleton Loaders ────────────────────────────────────────────────

export function SkeletonCard() {
  return <Skeleton className="h-[120px] w-full rounded-lg" />;
}

export function SkeletonTitle() {
  return <Skeleton className="h-6 w-3/5" />;
}

// ── Action Icons ────────────────────────────────────────────────────
// Small corner icons indicating user can interact with a card.

/** Citizen action available (vote, signal, upvote, propose) */
export function UserActionIcon({ title = "You can participate" }: { title?: string }) {
  return (
    <span title={title} className="text-blue-400 opacity-70">
      <UserRound className="size-3.5" />
    </span>
  );
}

/** MdB (parliament member) action available (direct vote, speech) */
export function MdbActionIcon({ title = "MdB action available" }: { title?: string }) {
  return (
    <span title={title} className="text-amber-400 opacity-70">
      <Landmark className="size-3.5" />
    </span>
  );
}

// ── Show More Button ────────────────────────────────────────────────

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
    <div className="flex justify-center py-2">
      <ShadButton variant="outline" size="sm" onClick={onShowMore}>
        {label || `Show ${next} more`} ({remaining} remaining)
      </ShadButton>
    </div>
  );
}

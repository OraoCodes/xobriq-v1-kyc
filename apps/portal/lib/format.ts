import type { DecisionAction } from "@xobriq/shared";

/** "10000004" -> "•••• 0004" — trailing-digits, the conventional masking pattern. Never render a full national ID. */
export function maskId(value: string): string {
  return `•••• ${value.length <= 4 ? value : value.slice(-4)}`;
}

export function maskPhone(value: string): string {
  if (value.length <= 4) return "••••";
  return `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function formatKes(amount: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 0 }).format(amount);
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export const VERDICT_LABEL: Record<DecisionAction, string> = {
  ALLOW: "Allow",
  STEP_UP: "Step up",
  REVIEW: "Review",
  BLOCK: "Block",
};

export const VERDICT_CLASSES: Record<DecisionAction, { text: string; bg: string; tint: string; border: string }> = {
  ALLOW: { text: "text-allow", bg: "bg-allow", tint: "bg-allow-tint", border: "border-allow" },
  STEP_UP: { text: "text-step-up", bg: "bg-step-up", tint: "bg-step-up-tint", border: "border-step-up" },
  REVIEW: { text: "text-review", bg: "bg-review", tint: "bg-review-tint", border: "border-review" },
  BLOCK: { text: "text-block", bg: "bg-block", tint: "bg-block-tint", border: "border-block" },
};

import { useEffect, type ReactNode } from "react";
import "./design-tokens.css";

/**
 * Custom Bito Theme provider supporting OS-synced Light & Dark Modes
 * (`data-theme="light" | "dark"`), reduced motion, and View Transitions sweep.
 */
export function applyBitoAppearance(
  preference: "system" | "light" | "dark" = "system",
) {
  if (typeof document === "undefined") return;
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved =
    preference === "system" ? (prefersDark ? "dark" : "light") : preference;
  const root = document.documentElement;
  if (root.dataset.theme !== resolved) {
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  }
}

export function BitoTheme({
  children,
  theme = "system",
}: {
  children: ReactNode;
  theme?: "system" | "light" | "dark";
}) {
  useEffect(() => {
    applyBitoAppearance(theme);
    if (
      theme !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyBitoAppearance("system");
    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, [theme]);

  return <div className="bito-theme-root">{children}</div>;
}

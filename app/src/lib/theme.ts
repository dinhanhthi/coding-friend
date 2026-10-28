export type Theme = "light" | "dark";

/** Sets `<html data-theme>` from the system appearance and keeps it in sync. Returns an unsubscribe. */
export function followSystemTheme(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = () => {
    const theme: Theme = query.matches ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  };
  apply();
  query.addEventListener("change", apply);
  return () => query.removeEventListener("change", apply);
}

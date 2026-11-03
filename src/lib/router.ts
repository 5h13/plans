import { useSyncExternalStore } from "react";

/** Hash routing so the app works from any static host and offline. */
export function useRoute(): string[] {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener("hashchange", l);
      return () => window.removeEventListener("hashchange", l);
    },
    () => window.location.hash,
  );
  return hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);
}
export function useQuery(): URLSearchParams {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener("hashchange", l);
      return () => window.removeEventListener("hashchange", l);
    },
    () => window.location.hash,
  );
  return new URLSearchParams(hash.split("?")[1] ?? "");
}
export const go = (path: string) => {
  window.location.hash = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
  window.scrollTo(0, 0);
};
export const href = (path: string) => `#/${path.replace(/^\//, "")}`;

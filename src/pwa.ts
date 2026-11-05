// Service worker registration (vite-plugin-pwa, Workbox; production builds only) and the update
// toast. A new version waits until the app is next launched; when one turns up while the app is
// open (checked on load and whenever the app comes back to the foreground), a toast offers to
// reload into it now.
import { registerSW } from "virtual:pwa-register";
import { SAMPLES_CACHE } from "./audio/samples.ts";

export function startPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  const update = registerSW({
    onNeedRefresh: () => (document.getElementById("update")!.hidden = false),
    onRegisteredSW: (_url, registration) =>
      document.addEventListener("visibilitychange", () => !document.hidden && void registration?.update().catch(() => {})),
  });
  document.getElementById("update-reload")!.addEventListener("click", () => void update(true));
  // Sample caches of earlier versions (SAMPLES_CACHE was bumped) go.
  if ("caches" in window)
    caches
      .keys()
      .then((keys) => keys.filter((k) => k.startsWith("cadenza-samples") && k !== SAMPLES_CACHE).forEach((k) => void caches.delete(k)))
      .catch(() => {});
}

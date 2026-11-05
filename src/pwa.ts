// Service worker registration (vite-plugin-pwa, Workbox; production builds only) and the update
// toast. A new version waits until the app is next launched; when one turns up while the app is
// open (checked on load and whenever the app comes back to the foreground), a toast offers to
// reload into it now.
import { registerSW } from "virtual:pwa-register";
import { SAMPLES_CACHE } from "./audio/samples.ts";

export function startPwa(): void {
  if (!("serviceWorker" in navigator)) return;
  // workbox-window reloads only pages that had a controller when they registered; a first
  // visit kept open until the next version reloads on the controller change itself.
  let reloading = false;
  const reload = () => !reloading && ((reloading = true), location.reload());
  const update = registerSW({
    onNeedRefresh: () => (document.getElementById("update")!.hidden = false),
    onNeedReload: reload,
    onRegisteredSW: (_url, registration) =>
      document.addEventListener("visibilitychange", () => !document.hidden && void registration?.update().catch(() => {})),
  });
  document.getElementById("update-reload")!.addEventListener("click", () => {
    navigator.serviceWorker.addEventListener("controllerchange", reload, { once: true });
    void update(true);
  });
  // Sample caches of earlier versions (SAMPLES_CACHE was bumped) go.
  if ("caches" in window)
    caches
      .keys()
      .then((keys) => keys.filter((k) => k.startsWith("cadenza-samples") && k !== SAMPLES_CACHE).forEach((k) => void caches.delete(k)))
      .catch(() => {});
}

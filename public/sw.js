// Minimal service worker — exists only so `Notification` can be shown via
// `registration.showNotification()`, which some browsers (Android Chrome in
// particular) *require* instead of the plain `new Notification()` constructor.
// No caching, no push handling, no offline support — just notification
// display + click routing.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow("/dashboard");
    }),
  );
});

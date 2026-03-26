/* Service Worker для Web Push (HAULZ) */
self.addEventListener("push", function (event) {
  if (!event.data) return;
  let payload = { title: "HAULZ", body: "" };
  try {
    const data = event.data.json();
    payload = { title: data.title || payload.title, body: data.body || "", url: data.url || "/" };
  } catch {
    payload.body = event.data.text();
  }
  const options = {
    body: payload.body,
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: { url: payload.url || "/" },
    tag: payload.tag || "haulz-notification",
    renotify: true,
  };
  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

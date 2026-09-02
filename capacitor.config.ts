import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.haulz.miniapp',
  appName: 'HAULZ',
  webDir: 'dist',
  ios: {
    // automatic + overflow-x на дашборде давали смещение контента вправо в WKWebView
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'App',
  },
  plugins: {
    // CapacitorHttp — нативный HTTP (как в рабочих сборках до переезда на api.haulz.space)
    CapacitorHttp: {
      enabled: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

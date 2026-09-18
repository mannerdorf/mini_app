/** Host bridge members used by the browser client. The bridge is absent in ordinary browsers. */
interface TelegramHostApp {
  ready(): void;
  expand(): void;
  close(): void;
  initData?: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; last_name?: string; username?: string }; query_id?: string };
  isExpanded?: boolean;
  themeParams?: Record<string, string>;
  platform?: string;
  MainButton: { isVisible: boolean; show(): void; hide(): void };
}
interface Window { Telegram?: { WebApp?: TelegramHostApp } }

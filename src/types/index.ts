export interface WebviewMessage {
  type: 'favorite-add' | 'favorite-remove' | 'go-to-settings' | 'open-inspector' | 
        'refresh-favorites' | 'reload' | 'show-message-box' | 'goToUrl' | 'goBack' | 
        'goForward' | 'home' | 'openFavorite' | 'autoReload' | 'setAutoReloadDuration' |
        'showHistory' | 'clearHistory' | 'openHistoryItem' | 'newTab' | 'closeTab' |
        'switchTab' | 'download';
  value?: any;
  url?: string;
  index?: number;
  duration?: number;
  tabId?: string;
  fileName?: string;
  fileData?: string;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserHistory {
  url: string;
  title: string;
  timestamp: number;
}

export interface Favorite {
  url: string;
  title: string;
  favicon?: string;
}

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  auth?: {
    username: string;
    password: string;
  };
}

export interface ExtensionConfig {
  proxy?: ProxyConfig;
  defaultUrl?: string;
  autoReload?: {
    enabled: boolean;
    duration: number;
  };
  favorites?: Favorite[];
  history?: BrowserHistory[];
}
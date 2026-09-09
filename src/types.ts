export interface Application {
  name: string;
  executable: string;
  path: string;
  icon: string | null;
}

export interface BrowserConfig {
  enabled: boolean;
  name: string;
  path: string;
  url: string;
}

export interface VPNConfig {
  enabled: boolean;
  name: string;
}

export interface ProfileConfig {
  name: string;
  description: string;
}

export interface CounterSchedule {
  start: string;
  lunchStart: string;
  lunchEnd: string;
  end: string;
}

export interface NotificationMessage {
  title: string;
  message: string;
}

export type CounterEventKey = "start" | "lunchStart" | "lunchEnd" | "end";

export interface CounterNotifications {
  enabled: boolean;
  sound: boolean;
  duration: number;
  messages: Record<CounterEventKey, NotificationMessage>;
}

export interface CounterTimeConfig {
  enabled: boolean;
  breakEnabled: boolean;
  schedule: CounterSchedule;
  notifications: CounterNotifications;
}

export interface JarvisConfig {
  profile: ProfileConfig;
  applications: Application[];
  browser: BrowserConfig;
  vpn: VPNConfig;
  counterTime: CounterTimeConfig;
}

export interface DetectedBrowser {
  name: string;
  path: string;
}

export interface DetectedVPN {
  name: string;
  status: string;
  connectionType?: string | null;
  tunnelType?: string | null;
}

export interface LaunchResult {
  success: boolean;
  pid?: number;
}

export interface VPNResult {
  success: boolean;
  connected: boolean;
  alreadyConnected?: boolean;
  waitingForWindows?: boolean;
  message?: string;
  output?: string;
}

export interface NotificationData {
  type: string;
  title: string;
  message: string;
  duration: number;
  sound: boolean;
  timestamp: number;
}

export interface JarvisAPI {
  getConfig(): Promise<JarvisConfig>;
  saveConfig(config: JarvisConfig): Promise<boolean>;
  launchProgram(programPath: string): Promise<LaunchResult>;
  closeLaunchedProcesses(): Promise<boolean>;
  selectExecutable(): Promise<Application | null>;
  detectApplications(): Promise<Application[]>;
  detectBrowsers(): Promise<DetectedBrowser[]>;
  launchBrowser(browser: BrowserConfig): Promise<LaunchResult>;
  detectVpn(): Promise<DetectedVPN[]>;
  connectVpn(vpnName: string): Promise<VPNResult>;
  disconnectVpn(vpnName: string): Promise<VPNResult>;
  showNotification(notification: Partial<NotificationData>): Promise<boolean>;
  closeNotification(): Promise<boolean>;
  onNotification(callback: (data: NotificationData) => void): () => void;
}

declare global {
  interface Window {
    jarvis: JarvisAPI;
    webkitAudioContext?: typeof AudioContext;
  }
}

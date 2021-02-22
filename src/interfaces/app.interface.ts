export interface AppConfig {
  port: number;
  extAuthenticationUrl: string;
  offlineMessageUrl?: string;
  db_host: string;
  db_port: number;
  db_name: string;
}

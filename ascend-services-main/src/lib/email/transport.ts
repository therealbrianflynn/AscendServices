export interface EmailMessage {
  to: string;
  /** Blind copies, e.g. admin oversight on the connection email. */
  bcc?: string[];
  subject: string;
  text: string;
  /** Template name used for log/metric grouping, e.g. `magic_link`. */
  template: string;
}

export interface SentEmail {
  transport: string;
  messageId: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<SentEmail>;
}

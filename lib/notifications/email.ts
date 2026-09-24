type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export interface EmailService {
  send(payload: EmailPayload): Promise<void>;
}

class ConsoleEmailService implements EmailService {
  async send(payload: EmailPayload) {
    console.info("[email:console]", payload);
  }
}

export function getEmailService(): EmailService {
  return new ConsoleEmailService();
}

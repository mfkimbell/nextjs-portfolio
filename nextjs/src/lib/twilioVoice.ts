type AppEnvironment = "DEV" | "PROD";

export type TwilioVoiceConfig = {
  accountSid: string;
  apiKey: string;
  apiSecret: string;
  appSid: string;
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/**
 * Production unless the .env explicitly says development:
 * APP_ENV=development (or "dev" / "DEV", any case) -> DEV; anything else,
 * including no APP_ENV at all -> PROD.
 */
export function appEnvironment(): AppEnvironment {
  return /^(dev|development)$/i.test(process.env.APP_ENV?.trim() ?? "") ? "DEV" : "PROD";
}

export function getTwilioVoiceConfig(): TwilioVoiceConfig {
  const environment = appEnvironment();
  const suffix = `_${environment}`;

  return {
    accountSid: requiredEnvironmentValue("TWILIO_ACCOUNT_SID"),
    apiKey: requiredEnvironmentValue(`TWILIO_API_KEY${suffix}`),
    apiSecret: requiredEnvironmentValue(`TWILIO_API_KEY_SECRET${suffix}`),
    appSid: requiredEnvironmentValue(`TWILIO_TWIML_APP_SID${suffix}`),
  };
}

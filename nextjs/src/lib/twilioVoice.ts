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

function appEnvironment(): AppEnvironment {
  const value = process.env.APP_ENV;
  if (value === "DEV" || value === "PROD") return value;
  throw new Error("APP_ENV must be DEV or PROD");
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

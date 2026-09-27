import { chmodSync, copyFileSync, existsSync, lstatSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import twilio from "twilio";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(scriptDirectory, "../.env");
const dryRun = process.argv.includes("--dry-run");
const appEnv = process.env.APP_ENV;

function fail(message) {
  throw new Error(message);
}

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

function required(values, name) {
  const value = values.get(name)?.trim();
  if (!value) fail(`Missing ${name} in ${envPath}`);
  return value;
}

function normalizedHttps(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} must be a valid HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.search || url.hash) {
    fail(`${name} must be an HTTPS URL without query or fragment`);
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString().replace(/\/$/, "");
}

function redact(sid) {
  return sid.length > 8 ? `${sid.slice(0, 2)}...${sid.slice(-4)}` : "[redacted]";
}

function replaceEnvValues(original, updates) {
  const remaining = new Map(updates);
  const lines = original.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([A-Z0-9_]+)(\s*=).*$/);
    if (!match || !remaining.has(match[2])) return line;
    const value = remaining.get(match[2]);
    remaining.delete(match[2]);
    return `${match[1]}${match[2]}${match[3]}${value}`;
  });
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

if (appEnv !== "DEV" && appEnv !== "PROD") {
  fail("APP_ENV must be supplied as exactly DEV or PROD, for example: APP_ENV=PROD pnpm twilio:setup");
}
if (!existsSync(envPath)) fail(`Expected ${envPath}`);
if (lstatSync(envPath).isSymbolicLink()) fail(`Refusing to mutate symlinked env file: ${envPath}`);

const original = readFileSync(envPath, "utf8");
const env = parseEnv(original);
const accountSid = required(env, "TWILIO_ACCOUNT_SID");
const authToken = required(env, "TWILIO_AUTH_TOKEN");
const agentBaseUrl = normalizedHttps(
  required(env, appEnv === "DEV" ? "DEV_AGENT_BASE_URL" : "PROD_AGENT_BASE_URL"),
  appEnv === "DEV" ? "DEV_AGENT_BASE_URL" : "PROD_AGENT_BASE_URL"
);
const suffix = `_${appEnv}`;
const appSidName = `TWILIO_TWIML_APP_SID${suffix}`;
const keyName = `TWILIO_API_KEY${suffix}`;
const keySecretName = `TWILIO_API_KEY_SECRET${suffix}`;
const friendlyName = `Mitchell Portfolio Bears (${appEnv})`;
const keyFriendlyName = `Mitchell Portfolio Bears Browser Key (${appEnv})`;
const voiceUrl = `${agentBaseUrl}/call`;
const client = twilio(accountSid, authToken);

let application;
const configuredAppSid = env.get(appSidName)?.trim();
if (configuredAppSid) {
  application = await client.applications(configuredAppSid).fetch();
  if (application.accountSid !== accountSid) fail(`${appSidName} belongs to a different Twilio account`);
} else {
  const matches = (await client.applications.list({ friendlyName, limit: 20 }))
    .filter((candidate) => candidate.friendlyName === friendlyName);
  if (matches.length > 1) fail(`Multiple TwiML Applications match ${friendlyName}; refusing to choose one`);
  application = matches[0];
}

let applicationAction = "unchanged";
if (!application) {
  applicationAction = "created";
  if (!dryRun) {
    application = await client.applications.create({ friendlyName, voiceUrl, voiceMethod: "POST" });
  }
} else if (application.voiceUrl !== voiceUrl || application.voiceMethod !== "POST" || application.friendlyName !== friendlyName) {
  applicationAction = "updated";
  if (!dryRun) {
    application = await client.applications(application.sid).update({ friendlyName, voiceUrl, voiceMethod: "POST" });
  }
}

const configuredKeySid = env.get(keyName)?.trim();
const configuredKeySecret = env.get(keySecretName)?.trim();
if (Boolean(configuredKeySid) !== Boolean(configuredKeySecret)) {
  fail(`${keyName} and ${keySecretName} must either both be present or both be absent`);
}

let keyAction = "reused";
let createdKey;
if (!configuredKeySid) {
  const matches = (await client.keys.list({ limit: 100 })).filter((key) => key.friendlyName === keyFriendlyName);
  if (matches.length > 0) {
    fail(`A key named ${keyFriendlyName} already exists but its one-time secret is not in ${envPath}; rotate it explicitly before rerunning`);
  }
  keyAction = "created";
  if (!dryRun) createdKey = await client.keys.create({ friendlyName: keyFriendlyName });
}

if (dryRun) {
  console.log(`APP_ENV: ${appEnv}`);
  console.log(`TwiML Application: ${applicationAction} (${voiceUrl})`);
  console.log(`Browser API key: ${keyAction}`);
  process.exit(0);
}

const updates = new Map([
  [appSidName, application?.sid],
  [keyName, configuredKeySid ?? createdKey?.sid],
  [keySecretName, configuredKeySecret ?? createdKey?.secret],
]);
for (const [name, value] of updates) if (!value) fail(`Twilio did not return ${name}`);

const backupPath = resolve(dirname(envPath), `${basename(envPath)}.backup-${Date.now()}`);
copyFileSync(envPath, backupPath);
chmodSync(backupPath, 0o600);
const temporaryPath = resolve(dirname(envPath), `.${basename(envPath)}.${process.pid}.tmp`);
writeFileSync(temporaryPath, replaceEnvValues(original, updates), { mode: 0o600 });
chmodSync(temporaryPath, 0o600);
renameSync(temporaryPath, envPath);
chmodSync(envPath, 0o600);

console.log(`APP_ENV: ${appEnv}`);
console.log(`TwiML Application: ${redact(updates.get(appSidName))} (${applicationAction})`);
console.log(`Voice URL: ${voiceUrl}`);
console.log(`Browser API key: ${redact(updates.get(keyName))} (${keyAction})`);
console.log(`Updated: ${envPath}`);

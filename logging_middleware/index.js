"use strict";

const DEFAULT_BASE_URL = "http://20.207.122.201/evaluation-service";

const ALLOWED_STACKS = new Set(["backend", "frontend"]);
const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);

const BACKEND_PACKAGES = new Set([
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service"
]);

const FRONTEND_PACKAGES = new Set(["api", "component", "hook", "page", "state", "style"]);
const SHARED_PACKAGES = new Set(["auth", "config", "middleware", "utils"]);

const config = {
  baseUrl: process.env.LOG_BASE_URL || DEFAULT_BASE_URL,
  clientId: process.env.LOG_CLIENT_ID || "",
  clientSecret: process.env.LOG_CLIENT_SECRET || "",
  token: process.env.LOG_ACCESS_TOKEN || ""
};

let tokenCache = {
  token: config.token,
  expiresAt: 0
};

function configureLogger(options = {}) {
  if (typeof options.baseUrl === "string" && options.baseUrl.trim()) {
    config.baseUrl = options.baseUrl.trim().replace(/\/$/, "");
  }

  if (typeof options.clientId === "string") {
    config.clientId = options.clientId.trim();
  }

  if (typeof options.clientSecret === "string") {
    config.clientSecret = options.clientSecret.trim();
  }

  if (typeof options.token === "string") {
    tokenCache = { token: options.token.trim(), expiresAt: 0 };
  }
}

function assertAllowedInput(stack, level, packageName, message) {
  if (!ALLOWED_STACKS.has(stack)) {
    throw new Error("Invalid stack. Use 'backend' or 'frontend'.");
  }

  if (!ALLOWED_LEVELS.has(level)) {
    throw new Error("Invalid level. Use one of: debug, info, warn, error, fatal.");
  }

  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Invalid message. Provide a non-empty string.");
  }

  const isShared = SHARED_PACKAGES.has(packageName);
  const isBackendPackage = BACKEND_PACKAGES.has(packageName);
  const isFrontendPackage = FRONTEND_PACKAGES.has(packageName);

  if (stack === "backend" && !(isShared || isBackendPackage)) {
    throw new Error("Invalid package for backend stack.");
  }

  if (stack === "frontend" && !(isShared || isFrontendPackage)) {
    throw new Error("Invalid package for frontend stack.");
  }
}

async function fetchAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  if (tokenCache.token && tokenCache.expiresAt === 0) {
    return tokenCache.token;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error("Missing auth credentials. Set LOG_CLIENT_ID and LOG_CLIENT_SECRET.");
  }

  const authUrl = `${config.baseUrl.replace(/\/$/, "")}/auth`;
  const response = await fetch(authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientID: config.clientId,
      clientSecret: config.clientSecret
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const accessToken = data.access_token || data.accessToken || data.token;

  if (!accessToken) {
    throw new Error("Auth response did not include an access token.");
  }

  const expiresRaw = Number(data.expires_in || data.expiresIn || 0);
  const nowSeconds = Math.floor(Date.now() / 1000);
  let expiresAtMs = 0;

  if (Number.isFinite(expiresRaw) && expiresRaw > 0) {
    if (expiresRaw > nowSeconds + 60) {
      expiresAtMs = expiresRaw * 1000 - 5000;
    } else {
      expiresAtMs = Date.now() + expiresRaw * 1000 - 5000;
    }
  }

  tokenCache = {
    token: accessToken,
    expiresAt: expiresAtMs
  };

  return tokenCache.token;
}

async function Log(stack, level, packageName, message) {
  assertAllowedInput(stack, level, packageName, message);

  const token = await fetchAccessToken();
  const logsUrl = `${config.baseUrl.replace(/\/$/, "")}/logs`;

  const response = await fetch(logsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      stack,
      level,
      package: packageName,
      message
    })
  });

  const rawBody = await response.text();
  const parsed = rawBody ? JSON.parse(rawBody) : {};

  if (!response.ok) {
    throw new Error(`Log request failed: ${response.status} ${rawBody}`);
  }

  return parsed;
}

module.exports = {
  Log,
  configureLogger
};

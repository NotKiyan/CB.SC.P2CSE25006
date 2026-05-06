"use strict";

const API_URL = "http://20.207.122.201/evaluation-service/notifications";
const TYPE_WEIGHTS = {
  placement: 3,
  result: 2,
  event: 1
};

class MinHeap {
  constructor(compareFn) {
    this.data = [];
    this.compare = compareFn;
  }

  size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(value) {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  pop() {
    if (this.data.length === 0) {
      return undefined;
    }

    const root = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this.bubbleDown(0);
    }

    return root;
  }

  toArray() {
    return [...this.data];
  }

  bubbleUp(index) {
    let i = index;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.compare(this.data[i], this.data[parent]) >= 0) {
        break;
      }
      [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
      i = parent;
    }
  }

  bubbleDown(index) {
    let i = index;
    const length = this.data.length;

    while (true) {
      let smallest = i;
      const left = i * 2 + 1;
      const right = i * 2 + 2;

      if (left < length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }

      if (right < length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }

      if (smallest === i) {
        break;
      }

      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
}

function parseEnvFile(envPath) {
  const fs = require("fs");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function normalizeType(inputType) {
  if (!inputType) {
    return "event";
  }
  return String(inputType).trim().toLowerCase();
}

function getCreatedAt(item) {
  const value = item.createdAt || item.created_at || item.timestamp || item.Timestamp || item.date;
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? 0 : time;
}

// is the notification unread 

function isUnread(item) {
  if (typeof item.isRead === "boolean") {
    return item.isRead === false;
  }
  if (typeof item.read === "boolean") {
    return item.read === false;
  }
  if (typeof item.status === "string") {
    return item.status.toLowerCase() === "unread";
  }
  return true;
}


function toPriorityRecord(item) {
  const type = normalizeType(item.type || item.notificationType || item.Type);
  const weight = TYPE_WEIGHTS[type] || 1;
  const createdAtMs = getCreatedAt(item);
  const score = weight * 1000000000000000 + createdAtMs;

  return {
    id: item.id || item.ID || item.notificationId || "unknown",
    type,
    title: item.title || item.message || item.Message || "",
    message: item.message || item.Message || "",
    createdAt: item.createdAt || item.created_at || item.timestamp || item.Timestamp || null,
    weight,
    score,
    raw: item
  };
}

function extractNotificationList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload && payload.data && Array.isArray(payload.data.notifications)) {
    return payload.data.notifications;
  }

  if (payload && Array.isArray(payload.notifications)) {
    return payload.notifications;
  }

  return [];
}

async function fetchNotifications(token) {
  const response = await fetch(API_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notification API failed: ${response.status} ${text}`);
  }

  return response.json();
}

function getTopNPriorityUnread(notifications, topN) {
  const heap = new MinHeap((a, b) => a.score - b.score);

  for (const item of notifications) {
    if (!isUnread(item)) {
      continue;
    }

    const record = toPriorityRecord(item);

    if (heap.size() < topN) {
      heap.push(record);
      continue;
    }

    if (heap.peek() && record.score > heap.peek().score) {
      heap.pop();
      heap.push(record);
    }
  }

  return heap
    .toArray()
    .sort((a, b) => b.score - a.score)
    .map(({ raw, ...rest }) => rest);
}

async function main() {
  parseEnvFile(`${process.cwd()}/.env`);

  const token = process.env.LOG_ACCESS_TOKEN;
  if (!token) {
    throw new Error("LOG_ACCESS_TOKEN is missing. Add it to .env or shell environment.");
  }

  const argN = Number(process.argv[2] || "10");
  const topN = Number.isInteger(argN) && argN > 0 ? argN : 10;

  const payload = await fetchNotifications(token);
  const notifications = extractNotificationList(payload);
  const topPriority = getTopNPriorityUnread(notifications, topN);

  const output = {
    totalFetched: notifications.length,
    topN,
    priorityOrder: "weight(type) + recency(createdAt)",
    weights: TYPE_WEIGHTS,
    topPriorityUnread: topPriority
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

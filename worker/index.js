// Cloudflare Worker — gguggu_Trip editor backend
// Endpoints:
//   GET  /overrides           → return current overrides JSON
//   POST /edit                → apply edit + commit to GitHub (requires password)
// Required env vars (Secrets):
//   GITHUB_TOKEN  — fine-grained PAT with contents:write on kanguk2/gguggu_Trip
//   EDIT_PASSWORD — shared password validated on every POST /edit

const REPO_OWNER = "kanguk2";
const REPO_NAME = "gguggu_Trip";
const OVERRIDES_PATH = "trips/sapporo-overrides.json";
const ALLOWED_ORIGINS = ["https://kanguk2.github.io"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/overrides") {
        const data = await loadOverrides(env);
        delete data._sha;
        return jsonResp(data, 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/edit") {
        const body = await request.json();
        if (!body.password || body.password !== env.EDIT_PASSWORD) {
          return jsonResp({ error: "invalid_password" }, 401, corsHeaders);
        }

        const overrides = await loadOverrides(env);
        const sha = overrides._sha;
        delete overrides._sha;
        if (!overrides.additions) overrides.additions = {};
        if (!overrides.notes) overrides.notes = {};
        if (!overrides.checks) overrides.checks = {};

        const action = body.action;
        if (action === "addItem") {
          const { date, time, name, coords } = body;
          if (!date || !time || !name) {
            return jsonResp({ error: "missing_fields" }, 400, corsHeaders);
          }
          if (!overrides.additions[date]) overrides.additions[date] = [];
          const id = "add-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
          const item = { id, time, name };
          if (Array.isArray(coords) && coords.length === 2) item.coords = coords;
          overrides.additions[date].push(item);
          await saveOverrides(env, overrides, sha, `Add ${date} ${time} ${name}`);
          return jsonResp({ ok: true, id, overrides }, 200, corsHeaders);
        }

        if (action === "updateItem") {
          const { date, id, time, name, coords } = body;
          const list = overrides.additions[date] || [];
          const item = list.find((i) => i.id === id);
          if (!item) return jsonResp({ error: "not_found" }, 404, corsHeaders);
          if (time) item.time = time;
          if (name) item.name = name;
          if (coords === null) delete item.coords;
          else if (Array.isArray(coords) && coords.length === 2) item.coords = coords;
          await saveOverrides(env, overrides, sha, `Edit ${date} ${item.time} ${item.name}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "setCheck") {
          const { key, checked } = body;
          if (!key) return jsonResp({ error: "missing_key" }, 400, corsHeaders);
          if (checked) overrides.checks[key] = true;
          else delete overrides.checks[key];
          await saveOverrides(env, overrides, sha, `${checked ? "Check" : "Uncheck"} ${key}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "deleteItem") {
          const { date, id } = body;
          const list = overrides.additions[date] || [];
          const removed = list.find((i) => i.id === id);
          if (!removed) return jsonResp({ error: "not_found" }, 404, corsHeaders);
          overrides.additions[date] = list.filter((i) => i.id !== id);
          await saveOverrides(env, overrides, sha, `Remove ${date} ${removed.time} ${removed.name}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "setNote") {
          const { key, note } = body;
          if (!key) return jsonResp({ error: "missing_key" }, 400, corsHeaders);
          if (note && note.trim()) {
            overrides.notes[key] = note.trim();
          } else {
            delete overrides.notes[key];
          }
          await saveOverrides(env, overrides, sha, `Note on ${key}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        return jsonResp({ error: "unknown_action", action }, 400, corsHeaders);
      }

      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return jsonResp({ error: "server_error", message: String(err) }, 500, corsHeaders);
    }
  },
};

async function loadOverrides(env) {
  const res = await ghFetch(env, "GET", `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${OVERRIDES_PATH}`);
  if (res.status === 404) {
    return { additions: {}, notes: {}, checks: {} };
  }
  if (!res.ok) {
    throw new Error(`GitHub GET failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const content = atob(data.content.replace(/\n/g, ""));
  const parsed = JSON.parse(decodeUtf8(content));
  parsed._sha = data.sha;
  if (!parsed.additions) parsed.additions = {};
  if (!parsed.notes) parsed.notes = {};
  if (!parsed.checks) parsed.checks = {};
  return parsed;
}

async function saveOverrides(env, overrides, sha, message) {
  const content = btoa(encodeUtf8(JSON.stringify(overrides, null, 2)));
  const body = { message, content };
  if (sha) body.sha = sha;
  const res = await ghFetch(env, "PUT", `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${OVERRIDES_PATH}`, body);
  if (!res.ok) {
    throw new Error(`GitHub PUT failed: ${res.status} ${await res.text()}`);
  }
}

function ghFetch(env, method, path, body) {
  return fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "gguggu-trip-worker",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function buildCorsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResp(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function encodeUtf8(str) {
  return new TextDecoder("latin1").decode(new TextEncoder().encode(str));
}

function decodeUtf8(latin1) {
  const bytes = new Uint8Array(latin1.length);
  for (let i = 0; i < latin1.length; i++) bytes[i] = latin1.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

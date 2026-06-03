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
        if (!overrides.itemEdits) overrides.itemEdits = {};
        if (!overrides.itemOrder) overrides.itemOrder = {};
        if (!overrides.checklistAdds) overrides.checklistAdds = [];
        if (!overrides.checklistEdits) overrides.checklistEdits = {};
        if (!overrides.checklistHidden) overrides.checklistHidden = {};

        const action = body.action;
        if (action === "addItem") {
          const { date, time, name, coords, image, links } = body;
          if (!date || !time || !name) {
            return jsonResp({ error: "missing_fields" }, 400, corsHeaders);
          }
          if (!overrides.additions[date]) overrides.additions[date] = [];
          const id = "add-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
          const item = { id, time, name };
          if (Array.isArray(coords) && coords.length === 2) item.coords = coords;
          if (typeof image === "string" && image) item.image = image;
          if (Array.isArray(links)) { const cl = cleanLinks(links); if (cl.length) item.links = cl; }
          overrides.additions[date].push(item);
          if (!overrides.itemOrder[date]) overrides.itemOrder[date] = [];
          overrides.itemOrder[date].unshift(`${date}/${id}`);
          await saveOverrides(env, overrides, sha, `Add ${date} ${time} ${name}`);
          return jsonResp({ ok: true, id, overrides }, 200, corsHeaders);
        }

        if (action === "addMemo") {
          const { date, text } = body;
          if (!date || !text) {
            return jsonResp({ error: "missing_fields" }, 400, corsHeaders);
          }
          if (!overrides.additions[date]) overrides.additions[date] = [];
          const id = "memo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
          overrides.additions[date].push({ id, kind: "memo", text });
          if (!overrides.itemOrder[date]) overrides.itemOrder[date] = [];
          overrides.itemOrder[date].unshift(`${date}/${id}`);
          await saveOverrides(env, overrides, sha, `Add memo ${date}`);
          return jsonResp({ ok: true, id, overrides }, 200, corsHeaders);
        }

        if (action === "updateItem") {
          const { date, id, time, name, coords, image, text, links } = body;
          const list = overrides.additions[date] || [];
          const item = list.find((i) => i.id === id);
          if (!item) return jsonResp({ error: "not_found" }, 404, corsHeaders);
          if (typeof text === "string") item.text = text;
          if (time) item.time = time;
          if (name) item.name = name;
          if (coords === null) delete item.coords;
          else if (Array.isArray(coords) && coords.length === 2) item.coords = coords;
          if (image === null) delete item.image;
          else if (typeof image === "string" && image) item.image = image;
          if (Array.isArray(links)) { const cl = cleanLinks(links); if (cl.length) item.links = cl; else delete item.links; }
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

        if (action === "setOrder") {
          const { date, order } = body;
          if (!date || !Array.isArray(order)) {
            return jsonResp({ error: "missing_fields" }, 400, corsHeaders);
          }
          overrides.itemOrder[date] = order;
          await saveOverrides(env, overrides, sha, `Reorder ${date}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "addCheckItem") {
          const { category, label } = body;
          if (!label) return jsonResp({ error: "missing_label" }, 400, corsHeaders);
          const id = "cadd-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
          overrides.checklistAdds.push({ id, category: category || "추가 항목", label });
          await saveOverrides(env, overrides, sha, `Add check item ${label}`);
          return jsonResp({ ok: true, id, overrides }, 200, corsHeaders);
        }

        if (action === "editCheckItem") {
          const { id, label } = body;
          if (!id || !label) return jsonResp({ error: "missing_fields" }, 400, corsHeaders);
          const custom = overrides.checklistAdds.find((c) => c.id === id);
          if (custom) {
            custom.label = label;
          } else {
            overrides.checklistEdits[id] = label;
          }
          await saveOverrides(env, overrides, sha, `Edit check item ${id}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "deleteCheckItem") {
          const { id } = body;
          if (!id) return jsonResp({ error: "missing_id" }, 400, corsHeaders);
          const idx = overrides.checklistAdds.findIndex((c) => c.id === id);
          if (idx >= 0) {
            overrides.checklistAdds.splice(idx, 1);
          } else {
            overrides.checklistHidden[id] = true;
            delete overrides.checklistEdits[id];
          }
          delete overrides.checks[id];
          await saveOverrides(env, overrides, sha, `Delete check item ${id}`);
          return jsonResp({ ok: true, overrides }, 200, corsHeaders);
        }

        if (action === "setItemEdit") {
          const { key, time, name, coords, image, links } = body;
          if (!key) return jsonResp({ error: "missing_key" }, 400, corsHeaders);
          const current = overrides.itemEdits[key] || {};
          if (typeof time === "string") current.time = time;
          if (typeof name === "string") current.name = name;
          if (coords === null) delete current.coords;
          else if (Array.isArray(coords) && coords.length === 2) current.coords = coords;
          if (image === null) delete current.image;
          else if (typeof image === "string" && image) current.image = image;
          if (Array.isArray(links)) { const cl = cleanLinks(links); if (cl.length) current.links = cl; else delete current.links; }
          if (Object.keys(current).length === 0) {
            delete overrides.itemEdits[key];
          } else {
            overrides.itemEdits[key] = current;
          }
          await saveOverrides(env, overrides, sha, `Edit static ${key}`);
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

        if (action === "uploadImage") {
          const { filename, dataBase64 } = body;
          if (!dataBase64) return jsonResp({ error: "missing_image" }, 400, corsHeaders);
          let ext = "jpg";
          if (typeof filename === "string" && filename.includes(".")) {
            const e = filename.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
            if (["jpg", "jpeg", "png", "gif", "webp"].includes(e)) ext = e === "jpeg" ? "jpg" : e;
          }
          const imgId = "img-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
          const path = `files/uploads/${imgId}.${ext}`;
          const res = await ghFetch(env, "PUT", `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
            message: `Upload image ${path}`,
            content: dataBase64,
          });
          if (!res.ok) {
            return jsonResp({ error: "upload_failed", message: await res.text() }, 500, corsHeaders);
          }
          return jsonResp({ ok: true, path: `./${path}` }, 200, corsHeaders);
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
    return { additions: {}, notes: {}, checks: {}, itemEdits: {}, itemOrder: {}, checklistAdds: [], checklistEdits: {}, checklistHidden: {} };
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
  if (!parsed.itemEdits) parsed.itemEdits = {};
  if (!parsed.itemOrder) parsed.itemOrder = {};
  if (!parsed.checklistAdds) parsed.checklistAdds = [];
  if (!parsed.checklistEdits) parsed.checklistEdits = {};
  if (!parsed.checklistHidden) parsed.checklistHidden = {};
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

// 참고 링크 정리 — http(s) URL 만 허용(javascript: 등 차단), 라벨 선택, 최대 10개
function cleanLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && typeof l.url === "string" && /^https?:\/\//i.test(l.url.trim()))
    .slice(0, 10)
    .map((l) => {
      const o = { url: l.url.trim() };
      if (typeof l.label === "string" && l.label.trim()) o.label = l.label.trim().slice(0, 60);
      return o;
    });
}

function encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return binary;
}

function decodeUtf8(binary) {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

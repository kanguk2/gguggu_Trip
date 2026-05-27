(function () {
  const STORAGE_KEY = "trip-gate-key-v1";
  const SENTINEL_PLAIN = "trip-gate-ok";
  const NOTFOUND_PATH = "./notfound.html";

  function b64ToBuf(b64) {
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
  }

  async function deriveKey(password) {
    const blob = window.TRIP_SECRET;
    const baseKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: blob.kdf.hash,
        salt: b64ToBuf(blob.salt),
        iterations: blob.kdf.iterations,
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function decryptToString(key, payload) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBuf(payload.iv) },
      key,
      b64ToBuf(payload.ct)
    );
    return new TextDecoder().decode(pt);
  }

  async function tryUnlock(password) {
    try {
      const key = await deriveKey(password);
      const sentPlain = await decryptToString(key, window.TRIP_SECRET.sentinel);
      if (sentPlain !== SENTINEL_PLAIN) return null;
      return key;
    } catch {
      return null;
    }
  }

  function unlock(password, key) {
    window.TRIP_GATE = {
      decryptPayload(name) {
        const p = window.TRIP_SECRET.payloads[name];
        if (!p) return Promise.reject(new Error("unknown payload: " + name));
        return decryptToString(key, p).then((txt) => JSON.parse(txt));
      },
    };
    document.body.classList.remove("gated");
    document.dispatchEvent(new CustomEvent("trip-gate:unlocked"));
  }

  function buildPrompt() {
    const modal = document.createElement("div");
    modal.className = "gate-modal";
    modal.innerHTML = `
      <form class="gate-card" autocomplete="off">
        <h2>접속 키 입력</h2>
        <p class="gate-desc">이 페이지를 보려면 키를 입력하세요.</p>
        <input type="password" class="gate-input" required spellcheck="false" autocapitalize="off">
        <button type="submit" class="btn">확인</button>
      </form>
    `;
    return modal;
  }

  function showPrompt() {
    const modal = buildPrompt();
    document.body.appendChild(modal);
    const form = modal.querySelector("form");
    const input = modal.querySelector("input");
    input.focus();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pwd = input.value;
      const key = await tryUnlock(pwd);
      if (key) {
        try {
          localStorage.setItem(STORAGE_KEY, pwd);
        } catch {}
        modal.remove();
        unlock(pwd, key);
      } else {
        window.location.replace(NOTFOUND_PATH);
      }
    });
  }

  async function init() {
    if (!window.TRIP_SECRET) {
      console.error("[gate] TRIP_SECRET not loaded");
      document.body.classList.remove("gated");
      return;
    }
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {}
    if (stored) {
      const key = await tryUnlock(stored);
      if (key) {
        unlock(stored, key);
        return;
      }
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showPrompt);
    } else {
      showPrompt();
    }
  }

  init();
})();

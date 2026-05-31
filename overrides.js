(function () {
  const WORKER_URL = "https://gguggutrip.tches0606.workers.dev";
  const PASSWORD_STORAGE_KEY = "trip-edit-password-v1";

  let overrides = { additions: {}, notes: {} };

  async function fetchOverrides() {
    try {
      const res = await fetch(`${WORKER_URL}/overrides`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      overrides = await res.json();
      if (!overrides.additions) overrides.additions = {};
      if (!overrides.notes) overrides.notes = {};
    } catch (e) {
      console.warn("[overrides] fetch failed, using empty", e);
    }
  }

  function getStoredPassword() {
    try { return localStorage.getItem(PASSWORD_STORAGE_KEY) || ""; }
    catch { return ""; }
  }

  function setStoredPassword(pw) {
    try { localStorage.setItem(PASSWORD_STORAGE_KEY, pw); }
    catch {}
  }

  async function callWorker(action, payload) {
    let password = getStoredPassword();
    if (!password) {
      password = await promptPassword();
      if (!password) return { error: "cancelled" };
    }
    const res = await fetch(`${WORKER_URL}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, password, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      try { localStorage.removeItem(PASSWORD_STORAGE_KEY); } catch {}
      alert("편집 비밀번호가 틀렸습니다. 다시 시도하세요.");
      return { error: "invalid_password" };
    }
    if (!res.ok) {
      const detail = data.message ? `\n\n[상세] ${data.message}` : "";
      alert(`저장 실패: ${data.error || res.status}${detail}`);
      console.error("[overrides] save failed", data);
      return { error: data.error || "unknown" };
    }
    setStoredPassword(password);
    if (data.overrides) {
      overrides = data.overrides;
      if (!overrides.additions) overrides.additions = {};
      if (!overrides.notes) overrides.notes = {};
    }
    return data;
  }

  function promptPassword() {
    return new Promise((resolve) => {
      const modal = buildPasswordModal((pw) => {
        modal.remove();
        resolve(pw);
      });
      document.body.appendChild(modal);
    });
  }

  function buildPasswordModal(onSubmit) {
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>편집 비밀번호</h2>
        <p class="edit-page-info">최초 한 번만 입력하면 됩니다.</p>
        <label class="edit-field">
          <span>비밀번호</span>
          <input type="password" name="password" required autofocus>
        </label>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">확인</button>
        </div>
      </form>
    `;
    modal.querySelector(".edit-cancel").addEventListener("click", () => onSubmit(null));
    modal.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      onSubmit(modal.querySelector("input").value);
    });
    return modal;
  }

  function staticKeyFor(li) {
    const date = li.closest(".tab-panel[data-panel]")?.dataset.panel;
    const time = li.querySelector(".plan-time")?.textContent.trim();
    if (!date || !time) return null;
    return `${date}/${time}`;
  }

  function applyNotes() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.dataset.addedId) return;
      const key = staticKeyFor(li);
      if (!key) return;
      li.dataset.itemKey = key;
      const existing = li.querySelector(".plan-user-note");
      if (existing) existing.remove();
      const note = overrides.notes[key];
      if (note) appendNote(li, note);
    });
  }

  function appendNote(li, text) {
    const nameSpan = li.querySelector(".plan-name");
    if (!nameSpan) return;
    const small = document.createElement("small");
    small.className = "plan-user-note";
    small.textContent = `📝 ${text}`;
    nameSpan.appendChild(small);
  }

  function applyAdditions() {
    document.querySelectorAll(".plan-item[data-added-id]").forEach((el) => el.remove());
    Object.entries(overrides.additions || {}).forEach(([date, items]) => {
      const panel = document.querySelector(`.tab-panel[data-panel="${date}"]`);
      if (!panel) return;
      const list = panel.querySelector(".plan-list");
      if (!list) return;
      items.forEach((item) => {
        const li = renderAddedItem(date, item);
        insertByTime(list, li);
      });
    });
  }

  function renderAddedItem(date, item) {
    const li = document.createElement("li");
    li.className = "plan-item plan-item-added";
    li.dataset.addedId = item.id;
    li.dataset.itemKey = `${date}/${item.id}`;
    li.innerHTML = `
      <span class="plan-time">${escapeHtml(item.time)}</span>
      <span class="plan-name">${escapeHtml(item.name)}</span>
      <span class="plan-added-badge" aria-hidden="true">＋</span>
    `;
    const noteText = overrides.notes[li.dataset.itemKey];
    if (noteText) appendNote(li, noteText);
    return li;
  }

  function insertByTime(list, li) {
    const time = li.querySelector(".plan-time").textContent.trim();
    const siblings = [...list.querySelectorAll(":scope > .plan-item")];
    const next = siblings.find((s) => {
      const t = s.querySelector(".plan-time")?.textContent.trim();
      return t && t > time;
    });
    if (next) list.insertBefore(li, next);
    else list.appendChild(li);
  }

  function addEditButtons() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.querySelector(".plan-edit-btn")) return;
      const btn = document.createElement("button");
      btn.className = "plan-edit-btn";
      btn.type = "button";
      btn.title = li.dataset.addedId ? "편집" : "메모 추가";
      btn.innerHTML = li.dataset.addedId ? "✎" : "📝";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(li);
      });
      li.appendChild(btn);
    });
  }

  function addAddNewButtons() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list").forEach((list) => {
      if (list.parentElement.querySelector(".plan-add-btn")) return;
      const btn = document.createElement("button");
      btn.className = "plan-add-btn";
      btn.type = "button";
      btn.textContent = "+ 새 일정 추가";
      btn.addEventListener("click", () => openAddModal(list.closest(".tab-panel").dataset.panel));
      list.after(btn);
    });
  }

  function openEditModal(li) {
    const isAdded = !!li.dataset.addedId;
    const date = li.closest(".tab-panel[data-panel]").dataset.panel;
    const key = li.dataset.itemKey;
    const time = li.querySelector(".plan-time").textContent.trim();
    const name = li.querySelector(".plan-name").firstChild?.textContent.trim() || "";
    const currentNote = overrides.notes[key] || "";

    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>${isAdded ? "일정 편집" : "메모 추가/수정"}</h2>
        <p class="edit-page-info">대상 <code>${escapeHtml(date)} ${escapeHtml(time)} · ${escapeHtml(name)}</code></p>
        ${isAdded ? `
          <label class="edit-field">
            <span>시간 (HH:MM)</span>
            <input type="text" name="time" value="${escapeHtml(time)}" required pattern="[0-9]{2}:[0-9]{2}">
          </label>
          <label class="edit-field">
            <span>장소·내용</span>
            <input type="text" name="name" value="${escapeHtml(name)}" required>
          </label>
        ` : ""}
        <label class="edit-field">
          <span>메모</span>
          <textarea name="note" rows="3" placeholder="이 항목에 대한 메모">${escapeHtml(currentNote)}</textarea>
        </label>
        <div class="edit-actions">
          ${isAdded ? `<button type="button" class="btn btn-secondary edit-delete">삭제</button>` : ""}
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">저장</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    if (isAdded) {
      modal.querySelector(".edit-delete").addEventListener("click", async () => {
        if (!confirm("이 일정을 삭제하시겠습니까?")) return;
        await callWorker("deleteItem", { date, id: li.dataset.addedId });
        applyAdditions();
        applyNotes();
        addEditButtons();
        close();
      });
    }

    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const noteVal = form.note.value;

      if (isAdded) {
        const newTime = form.time.value;
        const newName = form.name.value;
        if (newTime !== time || newName !== name) {
          await callWorker("updateItem", { date, id: li.dataset.addedId, time: newTime, name: newName });
        }
      }

      if (noteVal !== currentNote) {
        await callWorker("setNote", { key, note: noteVal });
      }

      applyAdditions();
      applyNotes();
      addEditButtons();
      close();
    });

    document.body.appendChild(modal);
  }

  function openAddModal(date) {
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>${escapeHtml(date)} 새 일정 추가</h2>
        <label class="edit-field">
          <span>시간 (HH:MM)</span>
          <input type="text" name="time" required pattern="[0-9]{2}:[0-9]{2}" placeholder="예: 14:00">
        </label>
        <label class="edit-field">
          <span>장소·내용</span>
          <input type="text" name="name" required placeholder="예: 카페 휴식">
        </label>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">추가</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const result = await callWorker("addItem", {
        date,
        time: e.target.time.value,
        name: e.target.name.value,
      });
      if (!result.error) {
        applyAdditions();
        addEditButtons();
        close();
      }
    });

    document.body.appendChild(modal);
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  async function init() {
    await fetchOverrides();
    applyNotes();
    applyAdditions();
    addEditButtons();
    addAddNewButtons();
  }

  function whenUnlocked(cb) {
    if (window.TRIP_GATE) cb();
    else document.addEventListener("trip-gate:unlocked", cb, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => whenUnlocked(init));
  } else {
    whenUnlocked(init);
  }
})();

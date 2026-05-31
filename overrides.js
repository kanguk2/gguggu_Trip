(function () {
  const WORKER_URL = "https://gguggutrip.tches0606.workers.dev";
  const PASSWORD_STORAGE_KEY = "trip-edit-password-v1";

  let overrides = { additions: {}, notes: {}, checks: {} };

  async function fetchOverrides() {
    try {
      const res = await fetch(`${WORKER_URL}/overrides`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      overrides = await res.json();
      if (!overrides.additions) overrides.additions = {};
      if (!overrides.notes) overrides.notes = {};
      if (!overrides.checks) overrides.checks = {};
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
      if (!overrides.checks) overrides.checks = {};
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
    if (item.coords) li.dataset.coords = `${item.coords[0]},${item.coords[1]}`;
    li.innerHTML = `
      <span class="plan-time">${escapeHtml(item.time)}</span>
      <span class="plan-name">${escapeHtml(item.name)}${item.coords ? '<span class="plan-coord-badge" title="지도 마커 있음">📍</span>' : ""}</span>
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

  function applyChecks() {
    const checks = overrides.checks || {};
    document.querySelectorAll(".checklist-item input[type=checkbox]").forEach((cb) => {
      const id = cb.id;
      const shouldCheck = !!checks[id];
      if (cb.checked !== shouldCheck) {
        cb.checked = shouldCheck;
        cb.closest(".checklist-item")?.classList.toggle("is-checked", shouldCheck);
        try {
          const local = JSON.parse(localStorage.getItem("sapporo-checklist-checks-v1") || "{}");
          if (shouldCheck) local[id] = true;
          else delete local[id];
          localStorage.setItem("sapporo-checklist-checks-v1", JSON.stringify(local));
        } catch {}
        const summary = document.querySelector(".checklist-summary");
        if (summary) {
          const done = document.querySelectorAll(".checklist-item.is-checked").length;
          const total = document.querySelectorAll(".checklist-item").length;
          summary.textContent = `${done} / ${total} 완료`;
        }
      }
      if (!cb.dataset.workerSync) {
        cb.dataset.workerSync = "1";
        cb.addEventListener("change", () => {
          callWorker("setCheck", { key: cb.id, checked: cb.checked });
        });
      }
    });
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

  async function geocodePlace(query) {
    if (!query || !window.google?.maps?.places) return null;
    return new Promise((resolve) => {
      try {
        const service = new google.maps.places.PlacesService(document.createElement("div"));
        service.findPlaceFromQuery(
          { query, fields: ["geometry"] },
          (results, status) => {
            try {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                results && results[0]?.geometry?.location
              ) {
                resolve([results[0].geometry.location.lat(), results[0].geometry.location.lng()]);
              } else {
                resolve(null);
              }
            } catch { resolve(null); }
          }
        );
      } catch { resolve(null); }
    });
  }

  function openEditModal(li) {
    const isAdded = !!li.dataset.addedId;
    const date = li.closest(".tab-panel[data-panel]").dataset.panel;
    const key = li.dataset.itemKey;
    const time = li.querySelector(".plan-time").textContent.trim();
    const nameRaw = li.querySelector(".plan-name");
    const name = (nameRaw ? nameRaw.firstChild?.textContent : "").trim();
    const currentNote = overrides.notes[key] || "";
    const currentCoords = li.dataset.coords || "";

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
          <label class="edit-field">
            <span>지도 마커 (선택 — 장소·주소·식당명 입력하면 지도에 표시)</span>
            <input type="text" name="place" placeholder="예: Sapporo Beer Garden" ${currentCoords ? `value="(현재 좌표 있음 — 새 값 입력 시 갱신)"` : ""}>
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
        rebuildCurrentDayMap();
        close();
      });
    }

    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const noteVal = form.note.value;
      let coordsUpdate = undefined;
      let didUpdate = false;

      if (isAdded) {
        const newTime = form.time.value;
        const newName = form.name.value;
        const placeQuery = form.place?.value?.trim();
        if (placeQuery && !placeQuery.startsWith("(현재 좌표")) {
          const coords = await geocodePlace(placeQuery);
          coordsUpdate = coords;
        }
        const payload = { date, id: li.dataset.addedId };
        if (newTime !== time) payload.time = newTime;
        if (newName !== name) payload.name = newName;
        if (coordsUpdate !== undefined) payload.coords = coordsUpdate;
        if (newTime !== time || newName !== name || coordsUpdate !== undefined) {
          await callWorker("updateItem", payload);
          didUpdate = true;
        }
      }

      if (noteVal !== currentNote) {
        await callWorker("setNote", { key, note: noteVal });
      }

      applyAdditions();
      applyNotes();
      addEditButtons();
      if (didUpdate) rebuildCurrentDayMap();
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
        <label class="edit-field">
          <span>지도 마커 (선택 — 비우면 지도에 표시 안 됨)</span>
          <input type="text" name="place" placeholder="예: Cafe Morihiko Sapporo">
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
      const placeQuery = e.target.place.value.trim();
      let coords = null;
      if (placeQuery) coords = await geocodePlace(placeQuery);
      const payload = {
        date,
        time: e.target.time.value,
        name: e.target.name.value,
      };
      if (coords) payload.coords = coords;
      const result = await callWorker("addItem", payload);
      if (!result.error) {
        applyAdditions();
        addEditButtons();
        if (coords) rebuildCurrentDayMap();
        close();
      }
    });

    document.body.appendChild(modal);
  }

  function activeDate() {
    const active = document.querySelector(".tab-panel.is-active[data-panel]");
    const panel = active?.dataset.panel;
    return panel && /^\d{4}-\d{2}-\d{2}$/.test(panel) ? panel : null;
  }

  function rebuildCurrentDayMap() {
    const date = activeDate();
    if (date && window.TRIP_REBUILD_DAY_MAP) window.TRIP_REBUILD_DAY_MAP(date);
  }

  async function syncAll() {
    showToast("동기화 중…");
    await fetchOverrides();
    applyNotes();
    applyAdditions();
    applyChecks();
    addEditButtons();
    rebuildCurrentDayMap();
    showToast("동기화 완료", 1500);
  }

  function showToast(text, autoHideMs) {
    let toast = document.querySelector(".sync-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "sync-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add("is-visible");
    if (autoHideMs) {
      clearTimeout(toast._t);
      toast._t = setTimeout(() => toast.classList.remove("is-visible"), autoHideMs);
    }
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  window.TRIP_OVERRIDES = {
    get additions() { return overrides.additions || {}; },
    get notes() { return overrides.notes || {}; },
    get checks() { return overrides.checks || {}; },
    sync: syncAll,
  };

  async function init() {
    await fetchOverrides();
    applyNotes();
    applyAdditions();
    applyChecks();
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

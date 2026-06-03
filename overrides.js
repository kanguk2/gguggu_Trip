(function () {
  const WORKER_URL = "https://gguggutrip.tches0606.workers.dev";
  const PASSWORD_STORAGE_KEY = "trip-edit-password-v1";

  let overrides = { additions: {}, notes: {}, checks: {}, itemEdits: {} };

  function normalizeOverrides() {
    if (!overrides.additions) overrides.additions = {};
    if (!overrides.notes) overrides.notes = {};
    if (!overrides.checks) overrides.checks = {};
    if (!overrides.itemEdits) overrides.itemEdits = {};
    if (!overrides.itemOrder) overrides.itemOrder = {};
    if (!overrides.checklistAdds) overrides.checklistAdds = [];
    if (!overrides.checklistEdits) overrides.checklistEdits = {};
    if (!overrides.checklistHidden) overrides.checklistHidden = {};
  }

  async function fetchOverrides() {
    try {
      const res = await fetch(`${WORKER_URL}/overrides`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      overrides = await res.json();
      normalizeOverrides();
    } catch (e) {
      console.warn("[overrides] fetch failed, using empty", e);
      normalizeOverrides();
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

  let isSaving = false;

  function setBusy(busy) {
    isSaving = busy;
    showSavingOverlay(busy);
    document.querySelectorAll(".plan-list").forEach((list) => {
      if (list._sortable) list._sortable.option("disabled", busy);
    });
  }

  async function callWorker(action, payload) {
    if (isSaving) {
      showToast("이전 작업을 저장하는 중입니다…", 1800);
      return { error: "busy" };
    }
    isSaving = true;
    try {
      let password = getStoredPassword();
      if (!password) {
        password = await promptPassword();
        if (!password) return { error: "cancelled" };
      }
      setBusy(true);
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
        normalizeOverrides();
      }
      return data;
    } finally {
      isSaving = false;
      setBusy(false);
    }
  }

  function showSavingOverlay(show) {
    let ov = document.querySelector(".saving-overlay");
    if (show) {
      if (!ov) {
        ov = document.createElement("div");
        ov.className = "saving-overlay";
        ov.innerHTML = `<div class="saving-box"><div class="saving-spinner" aria-hidden="true"></div><div class="saving-text">저장 중…</div></div>`;
        document.body.appendChild(ov);
      }
      requestAnimationFrame(() => ov.classList.add("is-visible"));
    } else if (ov) {
      ov.classList.remove("is-visible");
    }
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
    const origTime = li.dataset.originalTime || li.querySelector(".plan-time")?.textContent.trim();
    if (!date || !origTime) return null;
    return `${date}/${origTime}`;
  }

  function snapshotOriginals() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.dataset.addedId) return;
      if (!li.dataset.originalTime) {
        const t = li.querySelector(".plan-time")?.textContent.trim();
        if (t) li.dataset.originalTime = t;
      }
      if (!li.dataset.originalName) {
        const nm = li.querySelector(".plan-name");
        if (nm) {
          const first = [...nm.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
          li.dataset.originalName = (first ? first.textContent : nm.textContent).trim();
        }
      }
    });
  }

  function applyItemEdits() {
    const edits = overrides.itemEdits || {};
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.dataset.addedId) return;
      const key = staticKeyFor(li);
      if (!key) return;
      const edit = edits[key];
      const timeEl = li.querySelector(".plan-time");
      const nameEl = li.querySelector(".plan-name");
      if (!timeEl || !nameEl) return;
      const origTime = li.dataset.originalTime;
      const origName = li.dataset.originalName;
      timeEl.textContent = (edit && edit.time) || origTime;
      const firstText = [...nameEl.childNodes].find((n) => n.nodeType === 3);
      const newName = (edit && edit.name) || origName;
      if (firstText) firstText.textContent = newName;
      if (edit && (edit.time || edit.name)) li.classList.add("plan-item-overridden");
      else li.classList.remove("plan-item-overridden");
    });
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

  function applyOrder() {
    const itemOrder = overrides.itemOrder || {};
    Object.entries(itemOrder).forEach(([date, keys]) => {
      const panel = document.querySelector(`.tab-panel[data-panel="${date}"]`);
      if (!panel) return;
      const list = panel.querySelector(".plan-list");
      if (!list) return;
      const itemsByKey = new Map();
      const unkeyedItems = [];
      [...list.querySelectorAll(":scope > .plan-item")].forEach((li) => {
        const key = li.dataset.itemKey;
        if (key && keys.includes(key)) {
          itemsByKey.set(key, li);
        } else {
          unkeyedItems.push(li);
        }
      });
      keys.forEach((k) => {
        const li = itemsByKey.get(k);
        if (li) list.appendChild(li);
      });
      unkeyedItems.forEach((li) => list.appendChild(li));
    });
  }

  function setupDragDrop() {
    if (!window.Sortable) return;
    document.querySelectorAll(".tab-panel[data-panel] .plan-list").forEach((list) => {
      if (list.dataset.sortableInited) return;
      list.dataset.sortableInited = "1";
      list._sortable = new Sortable(list, {
        animation: 150,
        delay: 500,
        delayOnTouchOnly: false,
        touchStartThreshold: 8,
        filter: ".plan-edit-btn, .plan-toggle-icon, .plan-link, button, a, input, textarea",
        preventOnFilter: false,
        ghostClass: "plan-item-ghost",
        chosenClass: "plan-item-chosen",
        onChoose: (evt) => {
          evt.item.classList.add("plan-item-longpress");
        },
        onUnchoose: (evt) => {
          evt.item.classList.remove("plan-item-longpress");
        },
        onEnd: async (evt) => {
          evt.item.classList.remove("plan-item-longpress");
          const panel = list.closest(".tab-panel");
          const date = panel?.dataset.panel;
          if (!date) return;
          const keys = [...list.querySelectorAll(":scope > .plan-item")]
            .map((li) => li.dataset.itemKey)
            .filter(Boolean);
          const result = await callWorker("setOrder", { date, order: keys });
          if (result.error) {
            applyOrder();
          }
        },
      });
    });
  }

  function applyChecklistCustomizations() {
    const root = document.getElementById("checklist-root");
    if (!root) return;
    const edits = overrides.checklistEdits || {};
    const hidden = overrides.checklistHidden || {};
    const adds = overrides.checklistAdds || [];

    // 1. static label edits + hidden removal
    root.querySelectorAll(".checklist-item").forEach((li) => {
      const id = li.dataset.checkId;
      if (!id) return;
      if (li.dataset.custom) return;
      if (hidden[id]) { li.remove(); return; }
      if (edits[id]) {
        const span = li.querySelector(".checklist-label");
        if (span) span.textContent = edits[id];
      }
    });

    // 2. remove previously-rendered custom items (re-render fresh)
    root.querySelectorAll(".checklist-item[data-custom]").forEach((el) => el.remove());
    root.querySelectorAll(".checklist-custom-section").forEach((el) => el.remove());

    // 3. add custom items grouped by category
    const checks = overrides.checks || {};
    const noop = () => updateChecklistSummary();
    const byCat = {};
    adds.forEach((it) => {
      (byCat[it.category] = byCat[it.category] || []).push(it);
    });

    Object.entries(byCat).forEach(([catName, items]) => {
      let section = [...root.querySelectorAll(".checklist-category")]
        .find((s) => s.dataset.catName === catName);
      let list;
      if (section) {
        list = section.querySelector(".checklist-items");
      } else {
        section = document.createElement("section");
        section.className = "checklist-category checklist-custom-section";
        section.dataset.catName = catName;
        const h = document.createElement("h3");
        h.textContent = catName;
        section.appendChild(h);
        list = document.createElement("ul");
        list.className = "checklist-items";
        section.appendChild(list);
        root.appendChild(section);
      }
      items.forEach((it) => {
        if (window.TRIP_BUILD_CHECK_ITEM) {
          const li = window.TRIP_BUILD_CHECK_ITEM(it.id, it.label, checks, noop, true);
          list.appendChild(li);
        }
      });
    });

    addChecklistButtons();
  }

  function updateChecklistSummary() {
    const summary = document.querySelector(".checklist-summary");
    if (!summary) return;
    const done = document.querySelectorAll(".checklist-item.is-checked").length;
    const total = document.querySelectorAll(".checklist-item").length;
    summary.textContent = `${done} / ${total} 완료`;
  }

  function addChecklistButtons() {
    document.querySelectorAll("#checklist-root .checklist-item").forEach((li) => {
      if (li.querySelector(".check-edit-btn")) return;
      const id = li.dataset.checkId;
      if (!id) return;
      const tools = document.createElement("span");
      tools.className = "check-tools";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "check-edit-btn";
      editBtn.title = "수정";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCheckEditModal(li);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "check-del-btn";
      delBtn.title = "삭제";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("이 항목을 삭제하시겠습니까?")) return;
        const r = await callWorker("deleteCheckItem", { id });
        if (!r.error) { applyChecklistCustomizations(); applyChecks(); updateChecklistSummary(); }
      });

      tools.appendChild(editBtn);
      tools.appendChild(delBtn);
      li.appendChild(tools);
    });

    const root = document.getElementById("checklist-root");
    if (root && !root.querySelector(".check-add-btn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "check-add-btn plan-add-btn";
      btn.textContent = "+ 준비물 항목 추가";
      btn.addEventListener("click", () => openCheckAddModal());
      root.appendChild(btn);
    }
  }

  function openCheckEditModal(li) {
    const id = li.dataset.checkId;
    const cur = li.querySelector(".checklist-label")?.textContent || "";
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>준비물 항목 수정</h2>
        <label class="edit-field">
          <span>항목 내용</span>
          <input type="text" name="label" value="${escapeHtml(cur)}" required>
        </label>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">저장</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = e.target.label.value.trim();
      if (!label || label === cur) { close(); return; }
      const r = await callWorker("editCheckItem", { id, label });
      if (!r.error) { applyChecklistCustomizations(); applyChecks(); }
      close();
    });
    document.body.appendChild(modal);
  }

  function openCheckAddModal() {
    const cats = [...document.querySelectorAll("#checklist-root .checklist-category")]
      .map((s) => s.dataset.catName).filter(Boolean);
    const options = cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>준비물 항목 추가</h2>
        <label class="edit-field">
          <span>카테고리</span>
          <select name="category">${options}<option value="__custom__">+ 새 카테고리…</option></select>
        </label>
        <label class="edit-field check-newcat" hidden>
          <span>새 카테고리 이름</span>
          <input type="text" name="newcat" placeholder="예: 아기용품">
        </label>
        <label class="edit-field">
          <span>항목 내용</span>
          <input type="text" name="label" required placeholder="예: 보조배터리 2개">
        </label>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">추가</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    const sel = modal.querySelector("select[name=category]");
    const newcatField = modal.querySelector(".check-newcat");
    sel.addEventListener("change", () => {
      newcatField.hidden = sel.value !== "__custom__";
    });
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = e.target.label.value.trim();
      if (!label) return;
      let category = sel.value;
      if (category === "__custom__") category = e.target.newcat.value.trim() || "추가 항목";
      const r = await callWorker("addCheckItem", { category, label });
      if (!r.error) { applyChecklistCustomizations(); applyChecks(); updateChecklistSummary(); }
      close();
    });
    document.body.appendChild(modal);
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
        cb.addEventListener("change", async () => {
          const wanted = cb.checked;
          cb.closest(".checklist-item")?.classList.toggle("is-checked", wanted);
          const result = await callWorker("setCheck", { key: cb.id, checked: wanted });
          if (result.error) {
            cb.checked = !wanted;
            cb.closest(".checklist-item")?.classList.toggle("is-checked", !wanted);
          }
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
      btn.title = "편집·메모";
      btn.innerHTML = "✎";
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
    const origTime = li.dataset.originalTime || time;
    const origName = li.dataset.originalName || name;
    const currentNote = overrides.notes[key] || "";
    const currentCoords = li.dataset.coords || "";
    const editable = isAdded || true;

    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>${isAdded ? "일정 편집 (추가 항목)" : "일정 편집"}</h2>
        <p class="edit-page-info">대상 <code>${escapeHtml(date)} ${escapeHtml(origTime)} · ${escapeHtml(origName)}</code>${isAdded ? "" : "<br><small>원본은 그대로 두고 표시되는 시간·내용만 덮어쓰기</small>"}</p>
        <label class="edit-field">
          <span>시간 (HH:MM)</span>
          <input type="text" name="time" value="${escapeHtml(time)}" required pattern="[0-9]{2}:[0-9]{2}">
        </label>
        <label class="edit-field">
          <span>장소·내용</span>
          <input type="text" name="name" value="${escapeHtml(name)}" required>
        </label>
        <label class="edit-field">
          <span>지도 마커 (선택 — 장소·주소·식당명 입력하면 지도에 마커 표시)</span>
          <input type="text" name="place" placeholder="예: Sapporo Beer Garden" ${currentCoords ? `value="(현재 좌표 있음 — 새 값 입력 시 갱신)"` : ""}>
        </label>
        <label class="edit-field">
          <span>메모</span>
          <textarea name="note" rows="3" placeholder="이 항목에 대한 메모">${escapeHtml(currentNote)}</textarea>
        </label>
        <div class="edit-actions">
          ${isAdded ? `<button type="button" class="btn btn-secondary edit-delete">삭제</button>` : `<button type="button" class="btn btn-secondary edit-reset" title="원본 시간·내용으로 되돌리기">원본으로 되돌리기</button>`}
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
    } else {
      modal.querySelector(".edit-reset").addEventListener("click", async () => {
        if (!confirm("이 항목 시간·내용 변경을 모두 되돌리시겠습니까?")) return;
        await callWorker("setItemEdit", { key, time: "", name: "" });
        applyItemEdits();
        applyNotes();
        addEditButtons();
        close();
      });
    }

    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const noteVal = form.note.value;
      const newTime = form.time.value;
      const newName = form.name.value;
      let coordsUpdate = undefined;
      let didMapUpdate = false;

      if (isAdded) {
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
          didMapUpdate = true;
        }
      } else {
        const editPayload = { key };
        const editedTime = newTime !== origTime ? newTime : "";
        const editedName = newName !== origName ? newName : "";
        const placeQuery = form.place?.value?.trim();
        let staticCoords = undefined;
        if (placeQuery && !placeQuery.startsWith("(현재 좌표")) {
          staticCoords = await geocodePlace(placeQuery);
        }
        const prev = overrides.itemEdits?.[key] || {};
        const changedTime = editedTime !== (prev.time || "");
        const changedName = editedName !== (prev.name || "");
        const changedCoords = staticCoords !== undefined;
        if (changedTime || changedName || changedCoords) {
          if (changedTime) editPayload.time = editedTime;
          if (changedName) editPayload.name = editedName;
          if (changedCoords) editPayload.coords = staticCoords;
          await callWorker("setItemEdit", editPayload);
          if (changedCoords) didMapUpdate = true;
        }
      }

      if (noteVal !== currentNote) {
        await callWorker("setNote", { key, note: noteVal });
      }

      applyItemEdits();
      applyAdditions();
      applyNotes();
      addEditButtons();
      if (didMapUpdate) rebuildCurrentDayMap();
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
        applyOrder();
        addEditButtons();
        setupDragDrop();
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
    snapshotOriginals();
    applyItemEdits();
    applyNotes();
    applyAdditions();
    applyOrder();
    applyChecklistCustomizations();
    applyChecks();
    addEditButtons();
    setupDragDrop();
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
    get itemEdits() { return overrides.itemEdits || {}; },
    sync: syncAll,
  };

  async function init() {
    snapshotOriginals();
    await fetchOverrides();
    applyItemEdits();
    applyNotes();
    applyAdditions();
    applyOrder();
    applyChecklistCustomizations();
    applyChecks();
    addEditButtons();
    addAddNewButtons();
    setupDragDrop();
    // checklist re-renders async after maps etc.; re-apply if it fires later
    document.addEventListener("checklist:rendered", () => {
      applyChecklistCustomizations();
      applyChecks();
    });
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

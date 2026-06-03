(function () {
  const WORKER_URL = "https://gguggutrip.tches0606.workers.dev";
  const PASSWORD_STORAGE_KEY = "trip-edit-password-v1";

  // 도시 슬러그 — 페이지 파일명에서 자동 추출(sapporo.html → "sapporo"). 새 도시는 별도 설정 불필요.
  // 명시하려면 페이지에서 window.TRIP_CITY 를 지정해도 됨.
  const CITY = (window.TRIP_CITY ||
    (location.pathname.split("/").pop() || "").replace(/\.html$/i, "") ||
    "sapporo").toLowerCase().replace(/[^a-z0-9-]/g, "") || "sapporo";
  const CHECK_STORAGE_KEY = `${CITY}-checklist-checks-v1`;

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
    if (!overrides.itemHidden) overrides.itemHidden = {};
  }

  // 방금 업로드한 이미지의 dataURI 를 repo 경로로 매핑 — Pages 빌드(~30초) 전까지 즉시 표시용
  const recentImageData = {};

  function imgSrcFor(path) {
    return recentImageData[path] || path;
  }

  // li(plan-item) 의 전체폭 이미지 영역을 src 로 갱신. src 비면 제거.
  function setPlanItemImage(li, src) {
    let wrap = li.querySelector(":scope > .plan-image-wrap");
    if (!src) {
      if (wrap) wrap.remove();
      delete li.dataset.image;
      return;
    }
    li.dataset.image = src;
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "plan-image-wrap";
      const img = document.createElement("img");
      img.className = "plan-thumb";
      img.loading = "lazy";
      img.alt = "일정 이미지";
      img.title = "클릭하면 확대";
      img.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(img.src);
      });
      wrap.appendChild(img);
    }
    const img = wrap.querySelector("img");
    const realSrc = imgSrcFor(src);
    if (img.getAttribute("src") !== realSrc) img.src = realSrc;
    li.appendChild(wrap); // 항상 마지막 자식으로 (이미지는 항목 맨 아래 전체폭)
  }

  // 이미지 확대 (라이트박스) — 클릭/Esc/✕ 로 닫힘
  function openLightbox(src) {
    const ov = document.createElement("div");
    ov.className = "img-lightbox";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    const closeBtn = document.createElement("button");
    closeBtn.className = "img-lightbox-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "✕";
    ov.appendChild(img);
    ov.appendChild(closeBtn);
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      ov.remove();
      document.removeEventListener("keydown", onKey);
    }
    ov.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }

  // li(plan-item) 의 참고 링크 칩들을 갱신. 빈 배열이면 제거.
  function setPlanItemLinks(li, links) {
    const clean = (links || []).filter((l) => l && l.url);
    let wrap = li.querySelector(":scope > .plan-links");
    if (!clean.length) {
      if (wrap) wrap.remove();
      delete li.dataset.links;
      return;
    }
    li.dataset.links = JSON.stringify(clean);
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "plan-links";
    }
    wrap.innerHTML = "";
    clean.forEach((l) => {
      const a = document.createElement("a");
      a.className = "plan-link-chip";
      a.href = l.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "🔗 " + (l.label || linkLabelFromUrl(l.url));
      wrap.appendChild(a);
    });
    li.appendChild(wrap); // 트레일링 영역
  }

  function linkLabelFromUrl(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch { return "링크"; }
  }

  // 모달용 참고 링크 에디터 (여러 개 추가/삭제). _read() 로 [{url,label?}] 반환.
  function buildLinksEditor(initial) {
    const box = document.createElement("div");
    box.className = "edit-field edit-links";
    box.innerHTML = `
      <span>참고 링크 (여러 개 가능)</span>
      <div class="edit-links-list"></div>
      <button type="button" class="edit-link-add btn btn-secondary">+ 링크 추가</button>
    `;
    const list = box.querySelector(".edit-links-list");
    const addRow = (label, url) => {
      const row = document.createElement("div");
      row.className = "edit-link-row";
      row.innerHTML = `
        <input type="text" class="edit-link-label" placeholder="라벨 (선택)" value="${escapeHtml(label || "")}">
        <input type="url" class="edit-link-url" placeholder="https://..." value="${escapeHtml(url || "")}">
        <button type="button" class="edit-link-del" title="삭제">✕</button>
      `;
      row.querySelector(".edit-link-del").addEventListener("click", () => row.remove());
      list.appendChild(row);
    };
    (initial || []).forEach((l) => addRow(l.label, l.url));
    box.querySelector(".edit-link-add").addEventListener("click", () => addRow());
    box._read = () =>
      [...list.querySelectorAll(".edit-link-row")]
        .map((r) => ({
          label: r.querySelector(".edit-link-label").value.trim(),
          url: r.querySelector(".edit-link-url").value.trim(),
        }))
        .filter((l) => /^https?:\/\//i.test(l.url))
        .map((l) => (l.label ? { url: l.url, label: l.label } : { url: l.url }));
    return box;
  }

  // ── 이동(교통) 옵션 ─────────────────────────────────────────────
  function parseDep(s) {
    const m = String(s).match(/\d{1,2}:\d{2}/);
    if (!m) return "";
    const [h, mm] = m[0].split(":");
    return `${h.padStart(2, "0")}:${mm}`;
  }

  function renderTransitInner(transit) {
    const opts = (transit.options || []).map((o) => {
      const badges = [o.duration, o.price].filter(Boolean)
        .map((b) => `<span class="badge">${escapeHtml(b)}</span>`).join("");
      const note = o.note ? `<p class="transit-note">${escapeHtml(o.note)}</p>` : "";
      const times = (o.times || []).map((t) =>
        `<li class="transit-time" data-dep="${escapeHtml(parseDep(t))}">${escapeHtml(t)}</li>`).join("");
      const timesBlock = times ? `<ul class="transit-times">${times}</ul>` : "";
      return `<li><div class="transit-name">${escapeHtml(o.name)}</div><div class="transit-meta">${badges}</div>${note}${timesBlock}</li>`;
    }).join("");
    const note = transit.note ? `<p class="transit-disclaimer">${escapeHtml(transit.note)}</p>` : "";
    return `<div class="plan-detail"><ul class="transit-options">${opts}</ul>${note}<button type="button" class="transit-sync-btn">🔄 시간에 맞춰 동기화</button></div>`;
  }

  // 항목 시각(itemTime) 이후 가장 가까운 출발편 강조(.is-next), 지난 건 흐리게(.is-past)
  function syncTransitTimes(scope, itemTime) {
    if (!itemTime) return;
    scope.querySelectorAll(".transit-times").forEach((ul) => {
      let nextMarked = false;
      [...ul.querySelectorAll(".transit-time")].forEach((li) => {
        const dep = li.dataset.dep;
        li.classList.remove("is-past", "is-next");
        if (!dep) return;
        if (dep < itemTime) li.classList.add("is-past");
        else if (!nextMarked) { li.classList.add("is-next"); nextMarked = true; }
      });
    });
  }

  // plan-item 아래에 이동옵션 펼침(details) 블록 주입/갱신. transit 없으면 제거.
  function applyTransit(li, transit) {
    let wrap = li.querySelector(":scope > .plan-transit");
    if (!transit || !(transit.options || []).length) {
      if (wrap) wrap.remove();
      delete li.dataset.transit;
      return;
    }
    li.dataset.transit = "1";
    const wasOpen = wrap && wrap.open;
    if (wrap) wrap.remove();
    wrap = document.createElement("details");
    wrap.className = "plan-transit";
    if (wasOpen) wrap.open = true;
    wrap.innerHTML = `<summary class="plan-transit-summary">🚉 이동 옵션 <span class="plan-transit-icon" aria-hidden="true">▾</span></summary>${renderTransitInner(transit)}`;
    const itemTime = () => li.querySelector(".plan-time")?.textContent.trim() || "";
    syncTransitTimes(wrap, itemTime());
    const syncBtn = wrap.querySelector(".transit-sync-btn");
    if (syncBtn) syncBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      syncTransitTimes(wrap, itemTime());
      showToast("이동 옵션을 시간에 맞춰 동기화했습니다", 1500);
    });
    li.appendChild(wrap);
  }

  // 추가/편집 모달용 이동옵션 에디터. _read() → { enabled, transit }
  function buildTransitEditor(initial) {
    const box = document.createElement("div");
    box.className = "edit-field edit-transit";
    box.innerHTML = `
      <label class="edit-check-inline"><input type="checkbox" class="transit-enable"> 이동(교통) 옵션 추가</label>
      <div class="transit-editor" hidden>
        <div class="transit-opts"></div>
        <button type="button" class="transit-opt-add btn btn-secondary">+ 이동수단 추가</button>
      </div>
    `;
    const enable = box.querySelector(".transit-enable");
    const editor = box.querySelector(".transit-editor");
    const optsBox = box.querySelector(".transit-opts");
    const addOpt = (o) => {
      o = o || {};
      const row = document.createElement("div");
      row.className = "transit-opt-row";
      row.innerHTML = `
        <input type="text" class="t-name" placeholder="수단 (예: JR 쾌속)" value="${escapeHtml(o.name || "")}">
        <div class="transit-opt-grid">
          <input type="text" class="t-dur" placeholder="소요 (예: 37분)" value="${escapeHtml(o.duration || "")}">
          <input type="text" class="t-price" placeholder="요금 (예: ¥640)" value="${escapeHtml(o.price || "")}">
        </div>
        <input type="text" class="t-note" placeholder="메모 (선택)" value="${escapeHtml(o.note || "")}">
        <textarea class="t-times" rows="2" placeholder="시간표 — 한 줄에 하나 (예: 13:00 → 13:37)">${escapeHtml((o.times || []).join("\n"))}</textarea>
        <button type="button" class="transit-opt-del" title="이 수단 삭제">✕ 수단 삭제</button>
      `;
      row.querySelector(".transit-opt-del").addEventListener("click", () => row.remove());
      optsBox.appendChild(row);
    };
    enable.addEventListener("change", () => {
      editor.hidden = !enable.checked;
      if (enable.checked && !optsBox.children.length) addOpt();
    });
    box.querySelector(".transit-opt-add").addEventListener("click", () => addOpt());
    if (initial && (initial.options || []).length) {
      enable.checked = true;
      editor.hidden = false;
      initial.options.forEach(addOpt);
    }
    box._read = () => {
      if (!enable.checked) return { enabled: false, transit: null };
      const options = [...optsBox.querySelectorAll(".transit-opt-row")].map((r) => {
        const opt = { name: r.querySelector(".t-name").value.trim() };
        const dur = r.querySelector(".t-dur").value.trim();
        const price = r.querySelector(".t-price").value.trim();
        const note = r.querySelector(".t-note").value.trim();
        const times = r.querySelector(".t-times").value.split("\n").map((s) => s.trim()).filter(Boolean);
        if (dur) opt.duration = dur;
        if (price) opt.price = price;
        if (note) opt.note = note;
        if (times.length) opt.times = times;
        return opt;
      }).filter((o) => o.name);
      return { enabled: true, transit: options.length ? { options } : null };
    };
    return box;
  }

  // 정적(하드코딩) 이동 항목에도 동기화 버튼 주입 + 출발시각 파싱 + 자동 동기화
  function enhanceStaticTransit() {
    document.querySelectorAll(".plan-item-expandable").forEach((li) => {
      const detail = li.querySelector(".plan-detail");
      if (!detail) return;
      const timesLists = detail.querySelectorAll(".transit-times");
      if (!timesLists.length) return;
      timesLists.forEach((ul) => {
        ul.querySelectorAll("li").forEach((row) => {
          if (!row.classList.contains("transit-time")) row.classList.add("transit-time");
          if (!row.dataset.dep) row.dataset.dep = parseDep(row.textContent);
        });
      });
      const itemTime = () => li.querySelector(".plan-time")?.textContent.trim() || "";
      if (!detail.querySelector(".transit-sync-btn")) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "transit-sync-btn";
        btn.textContent = "🔄 시간에 맞춰 동기화";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          syncTransitTimes(detail, itemTime());
          showToast("이동 옵션을 시간에 맞춰 동기화했습니다", 1500);
        });
        detail.appendChild(btn);
      }
      syncTransitTimes(detail, itemTime());
    });
  }

  // 파일 → 최대 1280px JPEG 로 축소 → base64 (data: 접두어 제거). 리포 비대화 방지.
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("read_failed"));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("decode_failed"));
        img.onload = () => {
          const MAX = 1280;
          let { width, height } = img;
          if (width > MAX || height > MAX) {
            const r = Math.min(MAX / width, MAX / height);
            width = Math.round(width * r);
            height = Math.round(height * r);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve({ dataUrl, dataBase64: dataUrl.split(",")[1], filename: "photo.jpg" });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 파일 업로드 → Worker 가 리포에 커밋 → 상대경로 반환. 즉시표시용 dataUrl 도 캐시.
  async function uploadImageFile(file) {
    let compressed;
    try {
      compressed = await compressImage(file);
    } catch {
      showToast("이미지를 읽지 못했습니다", 2000);
      return null;
    }
    const r = await callWorker("uploadImage", { filename: compressed.filename, dataBase64: compressed.dataBase64 });
    if (r.error || !r.path) return null;
    recentImageData[r.path] = compressed.dataUrl;
    return r.path;
  }

  async function fetchOverrides() {
    try {
      const res = await fetch(`${WORKER_URL}/overrides?city=${encodeURIComponent(CITY)}`, { cache: "no-store" });
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
        body: JSON.stringify({ action, password, city: CITY, ...payload }),
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
      setPlanItemAddr(li, (edit && edit.addr) || "");
      setPlanItemLinks(li, (edit && edit.links) || []);
      applyTransit(li, (edit && edit.transit) || null);
      setPlanItemImage(li, (edit && edit.image) || "");
    });
  }

  // 원본(정적) 항목 숨김 — itemHidden[key] 인 정적 plan-item 을 display:none 으로 가림(복구 가능)
  function applyItemHidden() {
    const hidden = overrides.itemHidden || {};
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.dataset.addedId) return; // 추가 항목은 삭제(deleteItem)로 처리
      const key = staticKeyFor(li);
      li.classList.toggle("plan-item-hidden", !!(key && hidden[key]));
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
    setupClamps();
  }

  function appendNote(li, text) {
    const nameSpan = li.querySelector(".plan-name");
    if (!nameSpan) return;
    const small = document.createElement("small");
    small.className = "plan-user-note";
    const t = document.createElement("span");
    t.className = "plan-note-text clamp-text";
    t.textContent = `📝 ${text}`;
    small.appendChild(t);
    nameSpan.appendChild(small);
  }

  // 긴 텍스트(메모) 3줄 클램프 + '더보기/접기' 토글. 넘칠 때만 버튼 표시.
  // 숨은 탭(display:none)에선 높이 측정 불가 → 미완료로 두고 탭이 보일 때 재시도.
  function setupClamp(textEl) {
    if (textEl.dataset.clampDone) return;
    textEl.classList.add("is-clamped"); // 측정 전까지 미리 접어둠(긴 텍스트 깜빡임 방지)
    requestAnimationFrame(() => {
      if (!textEl.isConnected || textEl.dataset.clampDone) return;
      if (textEl.offsetParent === null && textEl.clientHeight === 0) return; // 아직 안 보임 → 다음 기회에
      textEl.dataset.clampDone = "1";
      if (textEl.scrollHeight - textEl.clientHeight > 2) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "clamp-toggle";
        btn.textContent = "더보기";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const clamped = textEl.classList.toggle("is-clamped");
          btn.textContent = clamped ? "더보기" : "접기";
        });
        textEl.after(btn);
      } else {
        textEl.classList.remove("is-clamped");
      }
    });
  }

  function setupClamps() {
    document.querySelectorAll(".clamp-text").forEach((el) => {
      if (!el.dataset.clampDone) setupClamp(el);
    });
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
    setupClamps();
  }

  function renderAddedItem(date, item) {
    if (item.kind === "memo") return renderMemoItem(date, item);
    const li = document.createElement("li");
    li.className = "plan-item plan-item-added";
    li.dataset.addedId = item.id;
    li.dataset.itemKey = `${date}/${item.id}`;
    if (item.coords) li.dataset.coords = `${item.coords[0]},${item.coords[1]}`;
    li.innerHTML = `
      <span class="plan-time">${escapeHtml(item.time)}</span>
      <span class="plan-name">${escapeHtml(item.name)}</span>
    `;
    if (item.addr) setPlanItemAddr(li, item.addr);
    const noteText = overrides.notes[li.dataset.itemKey];
    if (noteText) appendNote(li, noteText);
    if (item.links) setPlanItemLinks(li, item.links);
    if (item.transit) applyTransit(li, item.transit);
    if (item.image) setPlanItemImage(li, item.image);
    return li;
  }

  function renderMemoItem(date, item) {
    const li = document.createElement("li");
    li.className = "plan-item plan-item-memo";
    li.dataset.addedId = item.id;
    li.dataset.memo = "1";
    li.dataset.itemKey = `${date}/${item.id}`;
    li.innerHTML = `
      <span class="plan-memo-icon" aria-hidden="true">📝</span>
      <span class="plan-memo-body"><span class="plan-memo-text clamp-text">${escapeHtml(item.text)}</span></span>
    `;
    if (item.image) setPlanItemImage(li, item.image);
    return li;
  }

  function insertByTime(list, li) {
    const timeEl = li.querySelector(".plan-time");
    if (!timeEl) { list.appendChild(li); return; } // 메모 등 시간 없는 항목은 끝에 (순서는 applyOrder 가 정함)
    const time = timeEl.textContent.trim();
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
        delay: 250,
        delayOnTouchOnly: false,
        touchStartThreshold: 8,
        filter: ".plan-edit-btn, .plan-toggle-icon, .plan-link, .plan-link-chip, .plan-thumb, .clamp-toggle, summary, .plan-transit, button, a, input, textarea",
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

    // 카테고리별 + 버튼 (제목 옆) — 해당 카테고리에 바로 항목 추가
    document.querySelectorAll("#checklist-root .checklist-category").forEach((section) => {
      const h = section.querySelector("h3");
      if (!h || h.querySelector(".check-cat-add-btn")) return;
      const catName = section.dataset.catName;
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "check-cat-add-btn";
      addBtn.title = `${catName}에 항목 추가`;
      addBtn.textContent = "＋";
      addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openCheckAddModal(catName);
      });
      h.appendChild(addBtn);
    });

    // 하단 버튼 — 새 카테고리 추가
    const root = document.getElementById("checklist-root");
    if (root && !root.querySelector(".check-add-btn")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "check-add-btn plan-add-btn";
      btn.textContent = "+ 새 카테고리 추가";
      btn.addEventListener("click", () => openCheckCategoryModal());
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

  // 특정 카테고리에 항목 추가 (제목 옆 + 버튼에서 호출, presetCategory 필수)
  function openCheckAddModal(presetCategory) {
    const category = presetCategory || "추가 항목";
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>준비물 항목 추가</h2>
        <p class="edit-page-info">카테고리 <code>${escapeHtml(category)}</code></p>
        <label class="edit-field">
          <span>항목 내용</span>
          <input type="text" name="label" required placeholder="예: 보조배터리 2개" autofocus>
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
      const label = e.target.label.value.trim();
      if (!label) return;
      const r = await callWorker("addCheckItem", { category, label });
      if (!r.error) { applyChecklistCustomizations(); applyChecks(); updateChecklistSummary(); }
      close();
    });
    document.body.appendChild(modal);
  }

  // 새 카테고리 추가 (하단 버튼) — 카테고리명 + 첫 항목. 항목 1개는 있어야 카테고리가 생성됨.
  function openCheckCategoryModal() {
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>새 카테고리 추가</h2>
        <p class="edit-page-info"><small>카테고리는 첫 항목과 함께 생성됩니다.</small></p>
        <label class="edit-field">
          <span>카테고리 이름</span>
          <input type="text" name="category" required placeholder="예: 아기용품" autofocus>
        </label>
        <label class="edit-field">
          <span>첫 항목 내용</span>
          <input type="text" name="label" required placeholder="예: 기저귀 10개">
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
      const category = e.target.category.value.trim();
      const label = e.target.label.value.trim();
      if (!category || !label) return;
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
          const local = JSON.parse(localStorage.getItem(CHECK_STORAGE_KEY) || "{}");
          if (shouldCheck) local[id] = true;
          else delete local[id];
          localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(local));
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

  // plan-item 우측 도구모음 (✎ 편집 + 마커 배지). col3 에 배치, 마커 배지는 sapporo.js 가 여기에 추가.
  function ensurePlanTools(li) {
    let tools = li.querySelector(":scope > .plan-tools");
    if (!tools) {
      tools = document.createElement("span");
      tools.className = "plan-tools";
      li.appendChild(tools);
    }
    return tools;
  }
  window.TRIP_ENSURE_PLAN_TOOLS = ensurePlanTools;

  function addEditButtons() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list .plan-item").forEach((li) => {
      if (li.querySelector(".plan-edit-btn")) return;
      const tools = ensurePlanTools(li);
      const btn = document.createElement("button");
      btn.className = "plan-edit-btn";
      btn.type = "button";
      btn.title = "편집·메모";
      btn.innerHTML = "✎";
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(li);
      });
      tools.insertBefore(btn, tools.firstChild); // 편집 버튼은 도구모음 왼쪽, 마커 배지는 그 오른쪽
      const transitWrap = li.querySelector(":scope > .plan-transit");
      if (transitWrap) li.appendChild(transitWrap);
      const linksWrap = li.querySelector(":scope > .plan-links");
      if (linksWrap) li.appendChild(linksWrap);
      const imgWrap = li.querySelector(":scope > .plan-image-wrap");
      if (imgWrap) li.appendChild(imgWrap); // 이미지는 항상 맨 아래 유지
    });
  }

  function addAddNewButtons() {
    document.querySelectorAll(".tab-panel[data-panel] .plan-list").forEach((list) => {
      if (list.parentElement.querySelector(".plan-add-row")) return;
      const date = list.closest(".tab-panel").dataset.panel;
      const row = document.createElement("div");
      row.className = "plan-add-row";

      const addBtn = document.createElement("button");
      addBtn.className = "plan-add-btn";
      addBtn.type = "button";
      addBtn.textContent = "+ 새 일정 추가";
      addBtn.addEventListener("click", () => openAddModal(date));

      const memoBtn = document.createElement("button");
      memoBtn.className = "plan-add-btn plan-add-memo-btn";
      memoBtn.type = "button";
      memoBtn.textContent = "+ 메모 추가";
      memoBtn.addEventListener("click", () => openMemoAddModal(date));

      row.appendChild(addBtn);
      row.appendChild(memoBtn);
      list.after(row);
    });
  }

  // 항목 이름 아래 주소 서브라인 주입/제거
  function setPlanItemAddr(li, addr) {
    const nameEl = li.querySelector(".plan-name");
    if (!nameEl) return;
    let sub = nameEl.querySelector(":scope > .plan-sub-addr");
    if (!addr) { if (sub) sub.remove(); return; }
    if (!sub) {
      sub = document.createElement("small");
      sub.className = "plan-sub plan-sub-addr";
      nameEl.appendChild(sub);
    }
    sub.textContent = addr;
  }

  async function ensureMapsLoaded() {
    if (window.google?.maps?.places) return true;
    try { if (window.TRIP_LOAD_MAPS) await window.TRIP_LOAD_MAPS(); } catch {}
    return !!window.google?.maps?.places;
  }

  // 구글맵 장소 검색 팝업. 결과를 선택하면 미니 지도에 위치를 보여주고, 확인 후 onPick 호출.
  function openPlaceSearch(onPick, initialQuery) {
    const modal = document.createElement("div");
    modal.className = "edit-overlay place-search-overlay";
    modal.innerHTML = `
      <form class="edit-card place-search-card" autocomplete="off">
        <h2>장소 검색</h2>
        <div class="place-search-row">
          <input type="text" class="place-search-input" placeholder="가게명·주소·키워드 (예: 스스키노 징기스칸)" value="${escapeHtml(initialQuery || "")}">
          <button type="submit" class="btn place-search-go">검색</button>
        </div>
        <div class="place-search-status"></div>
        <ul class="place-search-results"></ul>
        <div class="place-search-map" hidden></div>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary place-search-cancel">닫기</button>
          <button type="button" class="btn place-search-confirm" disabled>✓ 이 장소 등록</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    const input = modal.querySelector(".place-search-input");
    const status = modal.querySelector(".place-search-status");
    const results = modal.querySelector(".place-search-results");
    const mapEl = modal.querySelector(".place-search-map");
    const confirmBtn = modal.querySelector(".place-search-confirm");
    modal.querySelector(".place-search-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    let selected = null;       // { name, address, coords }
    let miniMap = null, miniMarker = null, markerLib = null;

    async function ensureMiniMap() {
      if (miniMap) return miniMap;
      mapEl.hidden = false;
      markerLib = await google.maps.importLibrary("marker");
      miniMap = new google.maps.Map(mapEl, {
        zoom: 15,
        center: { lat: 43.0618, lng: 141.3545 },
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
      return miniMap;
    }

    async function showOnMap(p) {
      const loc = p.geometry && p.geometry.location;
      if (!loc) return;
      await ensureMiniMap();
      const pos = { lat: loc.lat(), lng: loc.lng() };
      google.maps.event.trigger(miniMap, "resize");
      miniMap.setCenter(pos);
      miniMap.setZoom(16);
      if (miniMarker) miniMarker.map = null;
      const pin = new markerLib.PinElement({ background: "#c0392b", borderColor: "#fff", glyphColor: "#fff" });
      miniMarker = new markerLib.AdvancedMarkerElement({ position: pos, map: miniMap, content: pin.element, title: p.name || "" });
    }

    const pick = () => {
      if (!selected) return;
      onPick(selected);
      close();
    };
    confirmBtn.addEventListener("click", pick);

    const doSearch = async () => {
      const q = input.value.trim();
      if (!q) return;
      results.innerHTML = "";
      selected = null;
      confirmBtn.disabled = true;
      status.textContent = "검색 중…";
      const ok = await ensureMapsLoaded();
      if (!ok) { status.textContent = "지도를 불러오지 못했습니다. 잠시 후 다시 시도하세요."; return; }
      try {
        const svc = new google.maps.places.PlacesService(document.createElement("div"));
        svc.textSearch({ query: q }, (res, st) => {
          if (st !== google.maps.places.PlacesServiceStatus.OK || !res || !res.length) {
            status.textContent = "검색 결과가 없습니다.";
            return;
          }
          status.textContent = `${Math.min(res.length, 12)}개 결과 — 선택하면 지도에 위치가 표시됩니다`;
          res.slice(0, 12).forEach((p) => {
            const loc = p.geometry && p.geometry.location;
            const li = document.createElement("li");
            li.className = "place-search-item";
            li.innerHTML = `<span class="ps-name">${escapeHtml(p.name || "")}</span><span class="ps-addr">${escapeHtml(p.formatted_address || "")}</span>`;
            li.addEventListener("click", () => {
              results.querySelectorAll(".place-search-item").forEach((el) => el.classList.remove("is-selected"));
              li.classList.add("is-selected");
              selected = { name: p.name || "", address: p.formatted_address || "", coords: loc ? [loc.lat(), loc.lng()] : null };
              confirmBtn.disabled = !selected.coords;
              showOnMap(p);
            });
            li.addEventListener("dblclick", () => { if (loc) { selected = { name: p.name || "", address: p.formatted_address || "", coords: [loc.lat(), loc.lng()] }; pick(); } });
            results.appendChild(li);
          });
        });
      } catch { status.textContent = "검색에 실패했습니다."; }
    };
    modal.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); doSearch(); });
    document.body.appendChild(modal);
    input.focus();
    if (initialQuery) doSearch();
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
    if (li.dataset.memo) return openMemoModal(li);
    const isAdded = !!li.dataset.addedId;
    const date = li.closest(".tab-panel[data-panel]").dataset.panel;
    const key = li.dataset.itemKey;
    const time = li.querySelector(".plan-time").textContent.trim();
    const nameRaw = li.querySelector(".plan-name");
    const nameNode = nameRaw && [...nameRaw.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const name = (nameNode ? nameNode.textContent : "").trim();
    const origTime = li.dataset.originalTime || time;
    const origName = li.dataset.originalName || name;
    const currentNote = overrides.notes[key] || "";
    const currentCoords = li.dataset.coords || "";
    const hasMarker = li.dataset.hasMarker === "1" || !!li.dataset.coords;
    const currentImage = li.dataset.image || "";
    let currentLinks = [];
    try { currentLinks = JSON.parse(li.dataset.links || "[]"); } catch {}
    let currentTransit = null;
    let currentAddr = "";
    if (isAdded) {
      const it = (overrides.additions[date] || []).find((a) => a.id === li.dataset.addedId);
      currentTransit = (it && it.transit) || null;
      currentAddr = (it && it.addr) || "";
    } else {
      const e = overrides.itemEdits[key];
      currentTransit = (e && e.transit) || null;
      currentAddr = (e && e.addr) || "";
    }
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
          <span>지도 마커 (찾기로 검색하거나 직접 입력${hasMarker ? " — 새로 선택 시 갱신" : ""})</span>
          <div class="place-field-row">
            <input type="text" name="place" placeholder="예: Sapporo Beer Garden">
            <button type="button" class="btn btn-secondary place-find-btn">🔍 찾기</button>
          </div>
          <div class="place-picked" hidden></div>
        </label>
        ${hasMarker ? `<label class="edit-check-inline"><input type="checkbox" name="removeMarker"> 지도 마커 제거</label>` : ""}
        <label class="edit-field">
          <span>이미지 (선택 — 사진 첨부, 자동 축소됨)</span>
          <input type="file" name="image" accept="image/*">
        </label>
        <div class="edit-img-current"${currentImage ? "" : " hidden"}>
          <img class="edit-img-preview" src="${escapeHtml(imgSrcFor(currentImage))}" alt="">
          <button type="button" class="btn btn-secondary edit-img-remove">이미지 제거</button>
        </div>
        <div class="edit-links-slot"></div>
        <div class="edit-transit-slot"></div>
        <label class="edit-field">
          <span>메모</span>
          <textarea name="note" rows="3" placeholder="이 항목에 대한 메모">${escapeHtml(currentNote)}</textarea>
        </label>
        <div class="edit-actions">
          ${isAdded
            ? `<button type="button" class="btn btn-secondary edit-delete">삭제</button>`
            : `<button type="button" class="btn btn-secondary edit-delete" title="이 원본 일정을 목록에서 삭제">원본 삭제</button>
               <button type="button" class="btn btn-secondary edit-reset" title="원본 시간·내용으로 되돌리기">되돌리기</button>`}
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">저장</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const linksEditor = buildLinksEditor(currentLinks);
    modal.querySelector(".edit-links-slot").replaceWith(linksEditor);
    const transitEditor = buildTransitEditor(currentTransit);
    modal.querySelector(".edit-transit-slot").replaceWith(transitEditor);

    let picked = null;
    const nameInput = modal.querySelector("input[name=name]");
    const placeInput = modal.querySelector("input[name=place]");
    const pickedBox = modal.querySelector(".place-picked");
    if (currentAddr) { pickedBox.hidden = false; pickedBox.textContent = `현재 주소: ${currentAddr}`; }
    modal.querySelector(".place-find-btn").addEventListener("click", () => {
      openPlaceSearch((p) => {
        picked = p;
        if (!nameInput.value.trim()) nameInput.value = p.name;
        placeInput.value = p.name;
        pickedBox.hidden = false;
        pickedBox.textContent = `✓ ${p.name}${p.address ? " · " + p.address : ""}`;
      }, placeInput.value.trim() || nameInput.value.trim());
    });
    placeInput.addEventListener("input", () => { picked = null; });

    let removeImage = false;
    const imgCurrent = modal.querySelector(".edit-img-current");
    const imgPreview = modal.querySelector(".edit-img-preview");
    const fileInput = modal.querySelector("input[name=image]");
    modal.querySelector(".edit-img-remove").addEventListener("click", () => {
      removeImage = true;
      if (fileInput) fileInput.value = "";
      imgCurrent.hidden = true;
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) {
        removeImage = false;
        imgPreview.src = URL.createObjectURL(f);
        imgCurrent.hidden = false;
      }
    });

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
      modal.querySelector(".edit-delete").addEventListener("click", async () => {
        if (!confirm("이 원본 일정을 목록에서 삭제하시겠습니까?")) return;
        const r = await callWorker("setItemHidden", { key, hidden: true });
        if (!r.error) {
          applyItemHidden();
          rebuildCurrentDayMap();
          close();
        }
      });
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

      // 이미지: 새 파일 업로드 / 제거 / 변경없음
      let imageUpdate = undefined; // undefined=변경없음, null=제거, string=새 경로
      const imgFile = form.image?.files?.[0];
      if (imgFile) {
        const path = await uploadImageFile(imgFile);
        if (path) imageUpdate = path;
      } else if (removeImage && currentImage) {
        imageUpdate = null;
      }

      // 참고 링크: 에디터 값과 현재 값 비교해 변경 시에만 전송
      const newLinks = linksEditor._read();
      const linksChanged = JSON.stringify(newLinks) !== JSON.stringify(currentLinks);

      // 이동 옵션: 켜져 있으면 변경 시 전송, 껐는데 기존에 있었으면 제거(null)
      const tr = transitEditor._read();
      let transitUpdate = undefined; // undefined=변경없음, null=제거, object=설정
      if (tr.enabled && tr.transit) {
        if (JSON.stringify(tr.transit) !== JSON.stringify(currentTransit)) transitUpdate = tr.transit;
      } else if (!tr.enabled && currentTransit) {
        transitUpdate = null;
      }

      const removeMarker = !!form.removeMarker?.checked;
      const placeQuery = form.place?.value?.trim();

      // 좌표·주소: 검색으로 선택(picked) > 마커 제거 > 직접 입력 지오코딩
      let addrUpdate = undefined; // undefined=변경없음, null=제거, string=설정
      if (removeMarker) {
        coordsUpdate = null;
        if (currentAddr) addrUpdate = null;
      } else if (picked && picked.coords) {
        coordsUpdate = picked.coords;
        const a = picked.address || "";
        if (a !== currentAddr) addrUpdate = a || null;
      } else if (placeQuery) {
        coordsUpdate = await geocodePlace(placeQuery);
      }

      if (isAdded) {
        const payload = { date, id: li.dataset.addedId };
        if (newTime !== time) payload.time = newTime;
        if (newName !== name) payload.name = newName;
        if (coordsUpdate !== undefined) payload.coords = coordsUpdate;
        if (addrUpdate !== undefined) payload.addr = addrUpdate;
        if (imageUpdate !== undefined) payload.image = imageUpdate;
        if (linksChanged) payload.links = newLinks;
        if (transitUpdate !== undefined) payload.transit = transitUpdate;
        if (newTime !== time || newName !== name || coordsUpdate !== undefined || addrUpdate !== undefined || imageUpdate !== undefined || linksChanged || transitUpdate !== undefined) {
          await callWorker("updateItem", payload);
          didMapUpdate = true;
        }
      } else {
        const editPayload = { key };
        const editedTime = newTime !== origTime ? newTime : "";
        const editedName = newName !== origName ? newName : "";
        const staticCoords = coordsUpdate; // 위에서 결정됨 (undefined/null/배열)
        const prev = overrides.itemEdits?.[key] || {};
        const changedTime = editedTime !== (prev.time || "");
        const changedName = editedName !== (prev.name || "");
        const changedCoords = staticCoords !== undefined;
        const changedImage = imageUpdate !== undefined;
        const changedTransit = transitUpdate !== undefined;
        const changedAddr = addrUpdate !== undefined;
        if (changedTime || changedName || changedCoords || changedImage || linksChanged || changedTransit || changedAddr) {
          if (changedTime) editPayload.time = editedTime;
          if (changedName) editPayload.name = editedName;
          if (changedCoords) editPayload.coords = staticCoords;
          if (changedAddr) editPayload.addr = addrUpdate;
          if (changedImage) editPayload.image = imageUpdate;
          if (linksChanged) editPayload.links = newLinks;
          if (changedTransit) editPayload.transit = transitUpdate;
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
          <span>지도 마커 (찾기로 검색하거나 직접 입력 — 비우면 표시 안 됨)</span>
          <div class="place-field-row">
            <input type="text" name="place" placeholder="예: Cafe Morihiko Sapporo">
            <button type="button" class="btn btn-secondary place-find-btn">🔍 찾기</button>
          </div>
          <div class="place-picked" hidden></div>
        </label>
        <label class="edit-field">
          <span>이미지 (선택 — 사진 첨부, 자동 축소됨)</span>
          <input type="file" name="image" accept="image/*">
        </label>
        <div class="edit-links-slot"></div>
        <div class="edit-transit-slot"></div>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">추가</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    const linksEditor = buildLinksEditor([]);
    modal.querySelector(".edit-links-slot").replaceWith(linksEditor);
    const transitEditor = buildTransitEditor(null);
    modal.querySelector(".edit-transit-slot").replaceWith(transitEditor);

    let picked = null;
    const nameInput = modal.querySelector("input[name=name]");
    const placeInput = modal.querySelector("input[name=place]");
    const pickedBox = modal.querySelector(".place-picked");
    modal.querySelector(".place-find-btn").addEventListener("click", () => {
      openPlaceSearch((p) => {
        picked = p;
        if (!nameInput.value.trim()) nameInput.value = p.name;
        placeInput.value = p.name;
        pickedBox.hidden = false;
        pickedBox.textContent = `✓ ${p.name}${p.address ? " · " + p.address : ""}`;
      }, placeInput.value.trim() || nameInput.value.trim());
    });
    placeInput.addEventListener("input", () => { picked = null; pickedBox.hidden = true; });

    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const placeQuery = e.target.place.value.trim();
      let coords = null;
      let addr = undefined;
      if (picked && picked.coords) { coords = picked.coords; addr = picked.address || undefined; }
      else if (placeQuery) coords = await geocodePlace(placeQuery);
      const payload = {
        date,
        time: e.target.time.value,
        name: e.target.name.value,
      };
      if (coords) payload.coords = coords;
      if (addr) payload.addr = addr;
      const imgFile = e.target.image?.files?.[0];
      if (imgFile) {
        const path = await uploadImageFile(imgFile);
        if (path) payload.image = path;
      }
      const links = linksEditor._read();
      if (links.length) payload.links = links;
      const tr = transitEditor._read();
      if (tr.transit) payload.transit = tr.transit;
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

  // 메모 추가 — 일정처럼 리스트에 들어가고 드래그로 위치 변경 가능, 텍스트만 입력
  function openMemoAddModal(date) {
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>${escapeHtml(date)} 메모 추가</h2>
        <label class="edit-field">
          <span>메모 내용</span>
          <textarea name="text" rows="3" required placeholder="예: 우산 챙기기 / 환전소 위치 확인" autofocus></textarea>
        </label>
        <label class="edit-field">
          <span>이미지 (선택 — 사진 첨부, 자동 축소됨)</span>
          <input type="file" name="image" accept="image/*">
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
      const text = e.target.text.value.trim();
      if (!text) return;
      const payload = { date, text };
      const imgFile = e.target.image?.files?.[0];
      if (imgFile) {
        const path = await uploadImageFile(imgFile);
        if (path) payload.image = path;
      }
      const result = await callWorker("addMemo", payload);
      if (!result.error) {
        applyAdditions();
        applyOrder();
        addEditButtons();
        setupDragDrop();
        close();
      }
    });
    document.body.appendChild(modal);
  }

  // 메모 편집/삭제 (텍스트 + 이미지)
  function openMemoModal(li) {
    const date = li.closest(".tab-panel[data-panel]").dataset.panel;
    const id = li.dataset.addedId;
    const cur = li.querySelector(".plan-memo-text")?.textContent || "";
    const currentImage = li.dataset.image || "";
    const modal = document.createElement("div");
    modal.className = "edit-overlay";
    modal.innerHTML = `
      <form class="edit-card" autocomplete="off">
        <h2>메모 편집</h2>
        <label class="edit-field">
          <span>메모 내용</span>
          <textarea name="text" rows="3" required autofocus>${escapeHtml(cur)}</textarea>
        </label>
        <label class="edit-field">
          <span>이미지 (선택 — 사진 첨부, 자동 축소됨)</span>
          <input type="file" name="image" accept="image/*">
        </label>
        <div class="edit-img-current"${currentImage ? "" : " hidden"}>
          <img class="edit-img-preview" src="${escapeHtml(imgSrcFor(currentImage))}" alt="">
          <button type="button" class="btn btn-secondary edit-img-remove">이미지 제거</button>
        </div>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-delete">삭제</button>
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">저장</button>
        </div>
      </form>
    `;
    const close = () => modal.remove();
    modal.querySelector(".edit-cancel").addEventListener("click", close);
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

    let removeImage = false;
    const imgCurrent = modal.querySelector(".edit-img-current");
    const imgPreview = modal.querySelector(".edit-img-preview");
    const fileInput = modal.querySelector("input[name=image]");
    modal.querySelector(".edit-img-remove").addEventListener("click", () => {
      removeImage = true;
      fileInput.value = "";
      imgCurrent.hidden = true;
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files?.[0];
      if (f) { removeImage = false; imgPreview.src = URL.createObjectURL(f); imgCurrent.hidden = false; }
    });

    modal.querySelector(".edit-delete").addEventListener("click", async () => {
      if (!confirm("이 메모를 삭제하시겠습니까?")) return;
      const r = await callWorker("deleteItem", { date, id });
      if (!r.error) {
        applyAdditions();
        applyOrder();
        addEditButtons();
        close();
      }
    });
    modal.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (!text) return;

      let imageUpdate = undefined; // undefined=변경없음, null=제거, string=새 경로
      const imgFile = e.target.image?.files?.[0];
      if (imgFile) {
        const path = await uploadImageFile(imgFile);
        if (path) imageUpdate = path;
      } else if (removeImage && currentImage) {
        imageUpdate = null;
      }

      const changedText = text !== cur;
      if (changedText || imageUpdate !== undefined) {
        const payload = { date, id };
        if (changedText) payload.text = text;
        if (imageUpdate !== undefined) payload.image = imageUpdate;
        const r = await callWorker("updateItem", payload);
        if (!r.error) {
          applyAdditions();
          applyOrder();
          addEditButtons();
        }
      }
      close();
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
    applyItemHidden();
    applyNotes();
    applyAdditions();
    applyOrder();
    applyChecklistCustomizations();
    applyChecks();
    addEditButtons();
    enhanceStaticTransit();
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
    get itemHidden() { return overrides.itemHidden || {}; },
    sync: syncAll,
  };

  async function init() {
    snapshotOriginals();
    await fetchOverrides();
    applyItemEdits();
    applyItemHidden();
    applyNotes();
    applyAdditions();
    applyOrder();
    applyChecklistCustomizations();
    applyChecks();
    addEditButtons();
    addAddNewButtons();
    enhanceStaticTransit();
    setupDragDrop();
    // checklist re-renders async after maps etc.; re-apply if it fires later
    document.addEventListener("checklist:rendered", () => {
      applyChecklistCustomizations();
      applyChecks();
    });
    // 날짜 탭이 보일 때 클램프 재측정 (숨은 탭에선 높이 측정 불가)
    document.querySelectorAll(".tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => requestAnimationFrame(setupClamps));
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

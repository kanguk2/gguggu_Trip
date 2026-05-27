(function () {
  const REPO = "kanguk2/gguggu_Trip";

  function getPageName() {
    const parts = window.location.pathname.split("/");
    const last = parts[parts.length - 1] || "index.html";
    return last && last.endsWith(".html") ? last : "index.html";
  }

  function buildIssueUrl(title, body) {
    const params = new URLSearchParams({ title, body });
    return `https://github.com/${REPO}/issues/new?${params.toString()}`;
  }

  function build() {
    if (document.querySelector(".edit-fab")) return;

    const pageName = getPageName();
    const pageUrl = window.location.href.split("#")[0];

    const fab = document.createElement("button");
    fab.className = "edit-fab";
    fab.type = "button";
    fab.innerHTML = `<span aria-hidden="true">✏️</span><span class="edit-fab-label">현재 페이지 수정하기</span>`;
    fab.setAttribute("aria-label", "현재 페이지 수정 요청");

    const overlay = document.createElement("div");
    overlay.className = "edit-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <form class="edit-card" novalidate>
        <h2>이 페이지 수정 요청</h2>
        <p class="edit-page-info">대상 페이지 <code>${pageName}</code></p>
        <label class="edit-field">
          <span>제목</span>
          <input type="text" name="title" required placeholder="예: 호텔 주소 오타 수정">
        </label>
        <label class="edit-field">
          <span>요청 내용</span>
          <textarea name="body" rows="6" required placeholder="어떤 부분을 어떻게 수정하면 좋을지 적어주세요."></textarea>
        </label>
        <div class="edit-actions">
          <button type="button" class="btn btn-secondary edit-cancel">취소</button>
          <button type="submit" class="btn">GitHub Issue로 제출</button>
        </div>
      </form>
    `;

    const root = document.querySelector("main") || document.body;
    root.appendChild(fab);
    root.appendChild(overlay);

    const form = overlay.querySelector("form");
    const titleInput = form.querySelector("input[name='title']");
    const bodyInput = form.querySelector("textarea[name='body']");

    function open() {
      overlay.hidden = false;
      document.body.classList.add("edit-overlay-open");
      setTimeout(() => titleInput.focus(), 0);
    }

    function close() {
      overlay.hidden = true;
      document.body.classList.remove("edit-overlay-open");
    }

    fab.addEventListener("click", open);
    overlay.querySelector(".edit-cancel").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = titleInput.value.trim();
      const b = bodyInput.value.trim();
      if (!t || !b) return;
      const title = `[${pageName}] ${t}`;
      const body = `**페이지**: \`${pageName}\`\n**URL**: ${pageUrl}\n\n---\n\n${b}`;
      window.open(buildIssueUrl(title, body), "_blank", "noopener,noreferrer");
      form.reset();
      close();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();

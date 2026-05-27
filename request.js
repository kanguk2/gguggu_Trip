const REPO = "kanguk2/gguggu_Trip";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("request-form");
  const status = document.getElementById("status");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const title = (formData.get("title") || "").toString().trim();
    const body = (formData.get("body") || "").toString().trim();

    if (!title || !body) return;

    const url =
      `https://github.com/${REPO}/issues/new` +
      `?title=${encodeURIComponent(title)}` +
      `&body=${encodeURIComponent(body)}`;

    window.open(url, "_blank", "noopener,noreferrer");

    status.hidden = false;
    status.textContent =
      "새 탭이 열렸습니다. GitHub에서 'Submit new issue' 버튼을 눌러 등록을 완료해주세요.";
  });
});

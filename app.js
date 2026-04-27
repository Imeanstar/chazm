const LOCAL_STORAGE_KEY = "chazm-hint-board-v2";
const SESSION_KEY = "chazm-hint-board-user";
const DEFAULT_SLOT_COUNT = 60;
const MAX_IMAGE_SIZE = 1400;
const IMAGE_QUALITY = 0.84;

const config = window.HINT_BOARD_CONFIG || {};
const state = {
  user: "",
  submissions: [],
  imageData: "",
  ocrText: "",
  activeTab: "upload",
  selectedCategory: "",
  search: "",
  isAdmin: false,
  supabase: null,
};

const els = {
  storageMode: document.querySelector("#storageMode"),
  adminButton: document.querySelector("#adminButton"),
  logoutButton: document.querySelector("#logoutButton"),
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  nicknameInput: document.querySelector("#nicknameInput"),
  workspace: document.querySelector("#workspace"),
  currentNickname: document.querySelector("#currentNickname"),
  uploadGateText: document.querySelector("#uploadGateText"),
  tabs: document.querySelectorAll(".tab"),
  categoryList: document.querySelector("#categoryList"),
  uploadView: document.querySelector("#uploadView"),
  boardView: document.querySelector("#boardView"),
  reviewView: document.querySelector("#reviewView"),
  uploadForm: document.querySelector("#uploadForm"),
  imageInput: document.querySelector("#imageInput"),
  previewCard: document.querySelector("#previewCard"),
  imagePreview: document.querySelector("#imagePreview"),
  ocrText: document.querySelector("#ocrText"),
  ocrStatus: document.querySelector("#ocrStatus"),
  categoryInput: document.querySelector("#categoryInput"),
  numberInput: document.querySelector("#numberInput"),
  valueInput: document.querySelector("#valueInput"),
  noteInput: document.querySelector("#noteInput"),
  clearFormButton: document.querySelector("#clearFormButton"),
  boardTitle: document.querySelector("#boardTitle"),
  boardSearchInput: document.querySelector("#boardSearchInput"),
  boardCategorySelect: document.querySelector("#boardCategorySelect"),
  lockedState: document.querySelector("#lockedState"),
  boardGrid: document.querySelector("#boardGrid"),
  pendingCount: document.querySelector("#pendingCount"),
  reviewList: document.querySelector("#reviewList"),
  slotDialog: document.querySelector("#slotDialog"),
  slotDialogContent: document.querySelector("#slotDialogContent"),
  closeDialogButton: document.querySelector("#closeDialogButton"),
};

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `hint-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeCategory(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s*No\s*\.?\s*\d+.*/i, "")
    .trim();
}

function normalizeNumber(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : "";
}

function parseHeader(text) {
  const cleaned = String(text || "")
    .replace(/[|｜]/g, " ")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[NＮ][oO0Ｏ]\s*[.:：]?\s*/gi, "No.")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/(.+?)\s*No\.?\s*(\d{1,3})/i);
  if (!match) return { category: "", number: "" };

  return {
    category: normalizeCategory(match[1]),
    number: normalizeNumber(match[2]),
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function canUseSupabase() {
  return Boolean(window.supabase && config.SUPABASE_URL && config.SUPABASE_PUBLISH_KEY);
}

function setupSupabase() {
  if (!canUseSupabase()) {
    els.storageMode.textContent = "로컬 모드";
    return;
  }
  state.supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISH_KEY);
  els.storageMode.textContent = "Supabase";
}

function loadLocalSubmissions() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
    state.submissions = Array.isArray(saved) ? saved : [];
  } catch {
    state.submissions = [];
  }
}

function saveLocalSubmissions() {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.submissions));
}

async function loadSubmissions() {
  if (!state.supabase) {
    loadLocalSubmissions();
    return;
  }

  const { data, error } = await state.supabase
    .from("hint_submissions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn(error);
    loadLocalSubmissions();
    els.storageMode.textContent = "로컬 대체";
    return;
  }

  state.submissions = data.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    category: row.category,
    number: row.hint_no,
    value: row.hint_value || "",
    note: row.note || "",
    imageData: row.image_url || "",
    ocrText: row.ocr_text || "",
    status: row.status || "pending",
    createdAt: row.created_at,
  }));
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type: mime });
}

async function saveSubmission(submission) {
  if (!state.supabase) {
    state.submissions.unshift(submission);
    saveLocalSubmissions();
    return;
  }

  let imageUrl = submission.imageData;
  if (submission.imageData.startsWith("data:")) {
    const path = `${submission.category}/${submission.number}/${submission.id}.jpg`;
    const { error: uploadError } = await state.supabase.storage
      .from("hint-images")
      .upload(path, dataUrlToBlob(submission.imageData), {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    const { data } = state.supabase.storage.from("hint-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }

  const { error } = await state.supabase.from("hint_submissions").insert({
    id: submission.id,
    nickname: submission.nickname,
    category: submission.category,
    hint_no: submission.number,
    hint_value: submission.value,
    note: submission.note,
    image_url: imageUrl,
    ocr_text: submission.ocrText,
    status: submission.status,
  });
  if (error) throw error;
  await loadSubmissions();
}

async function updateStatuses(acceptedId, rejectedIds) {
  state.submissions = state.submissions.map((submission) => {
    if (submission.id === acceptedId) return { ...submission, status: "accepted" };
    if (rejectedIds.includes(submission.id)) return { ...submission, status: "rejected" };
    return submission;
  });

  if (!state.supabase) {
    saveLocalSubmissions();
    render();
    return;
  }

  if (acceptedId) {
    await state.supabase.from("hint_submissions").update({ status: "accepted" }).eq("id", acceptedId);
  }
  if (rejectedIds.length > 0) {
    await state.supabase.from("hint_submissions").update({ status: "rejected" }).in("id", rejectedIds);
  }
  await loadSubmissions();
  render();
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", IMAGE_QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function cropTopLeft(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = Math.min(img.width, Math.round(img.width * 0.82));
      const height = Math.min(img.height, Math.max(82, Math.round(img.height * 0.22)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function runOcr(dataUrl) {
  if (!window.Tesseract) {
    return { text: "OCR 라이브러리를 불러오지 못했습니다. 종류와 번호를 직접 입력해주세요.", parsed: {} };
  }

  const crop = await cropTopLeft(dataUrl);
  const result = await window.Tesseract.recognize(crop, "kor+eng", {
    logger: (event) => {
      if (event.status === "recognizing text") {
        els.ocrStatus.textContent = `OCR ${Math.round(event.progress * 100)}%`;
      }
    },
  });
  const text = result.data.text.trim();
  return { text, parsed: parseHeader(text) };
}

function userUploadCount() {
  return state.submissions.filter((submission) => submission.nickname === state.user).length;
}

function canViewBoard() {
  return state.isAdmin || userUploadCount() > 0;
}

function getVisibleSubmissions() {
  return state.submissions.filter((submission) => submission.status !== "rejected");
}

function getCategories() {
  const categories = new Map();
  getVisibleSubmissions().forEach((submission) => {
    const key = submission.category || "분류 미상";
    categories.set(key, (categories.get(key) || 0) + 1);
  });
  return [...categories.entries()].sort((a, b) => a[0].localeCompare(b[0], "ko-KR"));
}

function getSlotMap() {
  const map = new Map();
  getVisibleSubmissions().forEach((submission) => {
    const key = `${submission.category}::${submission.number}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(submission);
  });
  return map;
}

function getSlotState(submissions) {
  const accepted = submissions.find((submission) => submission.status === "accepted");
  if (submissions.length > 1) return { status: "검증중", submission: submissions[0], review: true };
  if (accepted) return { status: "확정", submission: accepted, review: false };
  return { status: "등록됨", submission: submissions[0], review: false };
}

function getFilteredSlots() {
  const query = state.search.trim().toLowerCase();
  const slots = [...getSlotMap().entries()].map(([key, submissions]) => {
    const [category, numberText] = key.split("::");
    const slot = getSlotState(submissions);
    return {
      key,
      category,
      number: Number(numberText),
      submissions,
      ...slot,
    };
  });

  return slots
    .filter((slot) => {
      const matchesCategory = !state.selectedCategory || slot.category === state.selectedCategory;
      const text = [
        slot.category,
        slot.number,
        slot.status,
        ...slot.submissions.flatMap((submission) => [submission.value, submission.note, submission.nickname]),
      ]
        .join(" ")
        .toLowerCase();
      return matchesCategory && (!query || text.includes(query));
    })
    .sort((a, b) => a.category.localeCompare(b.category, "ko-KR") || a.number - b.number);
}

function getBoardItems() {
  const slots = getFilteredSlots();
  if (!state.selectedCategory) return slots;

  const maxNumber = Math.max(DEFAULT_SLOT_COUNT, ...slots.map((slot) => slot.number));
  const slotByNumber = new Map(slots.map((slot) => [slot.number, slot]));
  return Array.from({ length: maxNumber }, (_, index) => {
    const number = index + 1;
    return (
      slotByNumber.get(number) || {
        key: `${state.selectedCategory}::${number}`,
        category: state.selectedCategory,
        number,
        submissions: [],
        status: "비어있음",
        submission: null,
        review: false,
        empty: true,
      }
    );
  });
}

function renderShell() {
  const loggedIn = Boolean(state.user);
  els.loginPanel.hidden = loggedIn;
  els.workspace.hidden = !loggedIn;
  els.logoutButton.hidden = !loggedIn;
  if (!loggedIn) return;

  els.currentNickname.textContent = state.user;
  const count = userUploadCount();
  els.uploadGateText.textContent = count > 0 ? `${count}개 제보함. 보드 열람 가능` : "첫 제보 전에는 보드가 잠겨 있습니다.";
  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = !state.isAdmin;
  });
}

function renderTabs() {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === state.activeTab);
  });
  els.uploadView.hidden = state.activeTab !== "upload";
  els.boardView.hidden = state.activeTab !== "board";
  els.reviewView.hidden = state.activeTab !== "review" || !state.isAdmin;
}

function renderCategories() {
  const categories = getCategories();
  els.categoryList.innerHTML = categories
    .map(([category, count]) => `<div class="category-item"><strong>${escapeHtml(category)}</strong><span>${count}</span></div>`)
    .join("");

  const current = els.boardCategorySelect.value;
  els.boardCategorySelect.innerHTML = [
    `<option value="">전체 종류</option>`,
    ...categories.map(([category]) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`),
  ].join("");
  els.boardCategorySelect.value = categories.some(([category]) => category === current) ? current : "";
}

function renderBoard() {
  const allowed = canViewBoard();
  els.lockedState.hidden = allowed;
  els.boardGrid.hidden = !allowed;
  els.boardTitle.textContent = state.selectedCategory ? `${state.selectedCategory} 보드` : "힌트 보드";
  if (!allowed) {
    els.boardGrid.innerHTML = "";
    return;
  }

  const slots = getBoardItems();
  els.boardGrid.innerHTML =
    slots
      .map((slot) => {
        if (slot.empty) {
          return `
            <article class="slot-card is-empty">
              <div class="slot-placeholder">No.${slot.number}</div>
              <div class="slot-body">
                <div class="slot-head">
                  <strong>No.${slot.number}</strong>
                  <span class="slot-state is-empty">비어있음</span>
                </div>
                <p class="slot-meta">${escapeHtml(slot.category)}</p>
              </div>
            </article>
          `;
        }
        const submission = slot.submission;
        const stateClass = slot.review ? "is-review" : "";
        return `
          <article class="slot-card ${stateClass}" data-slot="${escapeHtml(slot.key)}">
            <img class="slot-image" src="${escapeHtml(submission.imageData)}" alt="${escapeHtml(slot.category)} No.${slot.number}" />
            <div class="slot-body">
              <div class="slot-head">
                <strong>No.${slot.number}</strong>
                <span class="slot-state ${stateClass}">${slot.status}</span>
              </div>
              <p class="slot-value">${escapeHtml(submission.value || "내용 미입력")}</p>
              <p class="slot-meta">${escapeHtml(slot.category)} · ${slot.submissions.length}건</p>
              <button class="ghost-button" type="button" data-action="open-slot">보기</button>
            </div>
          </article>
        `;
      })
      .join("") || `<p class="locked-state"><strong>아직 조건에 맞는 제보가 없습니다.</strong></p>`;
}

function getReviewGroups() {
  return [...getSlotMap().entries()]
    .map(([key, submissions]) => {
      const [category, numberText] = key.split("::");
      return {
        key,
        category,
        number: Number(numberText),
        submissions,
        needsReview: submissions.length > 1,
      };
    })
    .filter((group) => group.needsReview)
    .sort((a, b) => a.category.localeCompare(b.category, "ko-KR") || a.number - b.number);
}

function renderReview() {
  const groups = getReviewGroups();
  els.pendingCount.textContent = `${groups.length}건`;
  els.reviewList.innerHTML =
    groups
      .map((group) => {
        const candidates = group.submissions
          .map(
            (submission) => `
              <article class="candidate">
                <img src="${escapeHtml(submission.imageData)}" alt="${escapeHtml(group.category)} No.${group.number} 후보" />
                <p class="slot-value">${escapeHtml(submission.value || "내용 미입력")}</p>
                <p class="slot-meta">${escapeHtml(submission.nickname)} · ${formatDate(submission.createdAt)}</p>
                <p class="slot-meta">${escapeHtml(submission.note || "메모 없음")}</p>
                <div class="candidate-actions">
                  <button class="primary-button" type="button" data-action="accept" data-id="${submission.id}" data-slot="${escapeHtml(group.key)}">이걸로 확정</button>
                  <button class="danger-button" type="button" data-action="reject" data-id="${submission.id}">제외</button>
                </div>
              </article>
            `,
          )
          .join("");
        return `
          <section class="review-group">
            <h3>${escapeHtml(group.category)} No.${group.number}</h3>
            <div class="candidate-grid">${candidates}</div>
          </section>
        `;
      })
      .join("") || `<p class="locked-state"><strong>검증중인 칸이 없습니다.</strong></p>`;
}

function render() {
  renderShell();
  renderTabs();
  renderCategories();
  renderBoard();
  renderReview();
}

function resetUploadForm() {
  state.imageData = "";
  state.ocrText = "";
  els.previewCard.hidden = true;
  els.imagePreview.removeAttribute("src");
  els.ocrText.textContent = "아직 인식 전입니다.";
  els.ocrStatus.textContent = "OCR 대기";
  els.ocrStatus.classList.remove("is-warning");
}

function openSlot(slotKey) {
  const slot = getFilteredSlots().find((item) => item.key === slotKey);
  if (!slot) return;

  const submission = slot.submission;
  els.slotDialogContent.innerHTML = `
    <div class="slot-detail">
      <img src="${escapeHtml(submission.imageData)}" alt="${escapeHtml(slot.category)} No.${slot.number}" />
      <div class="slot-detail-copy">
        <p class="eyebrow">${escapeHtml(slot.status)}</p>
        <h3>${escapeHtml(slot.category)} No.${slot.number}</h3>
        <p class="slot-value">${escapeHtml(submission.value || "내용 미입력")}</p>
        <p class="slot-meta">제보 ${slot.submissions.length}건 · 대표 제보자 ${escapeHtml(submission.nickname)}</p>
        <pre>${escapeHtml(submission.ocrText || "OCR 원문 없음")}</pre>
      </div>
    </div>
  `;
  els.slotDialog.showModal();
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const nickname = els.nicknameInput.value.trim();
  if (!nickname) return;
  state.user = nickname;
  localStorage.setItem(SESSION_KEY, nickname);
  await loadSubmissions();
  render();
});

els.logoutButton.addEventListener("click", () => {
  state.user = "";
  localStorage.removeItem(SESSION_KEY);
  render();
});

els.adminButton.addEventListener("click", () => {
  const code = prompt("관리자 검증 코드를 입력해주세요.");
  const expected = config.ADMIN_CODE || "admin";
  state.isAdmin = code === expected;
  if (!state.isAdmin) alert("관리자 코드가 맞지 않습니다.");
  if (state.isAdmin) state.activeTab = "review";
  render();
});

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeTab = tab.dataset.tab;
    render();
  });
});

els.imageInput.addEventListener("change", async () => {
  const [file] = els.imageInput.files;
  if (!file) {
    resetUploadForm();
    return;
  }

  els.ocrStatus.textContent = "이미지 준비중";
  els.ocrStatus.classList.remove("is-warning");
  state.imageData = await compressImage(file);
  els.imagePreview.src = state.imageData;
  els.previewCard.hidden = false;

  try {
    const { text, parsed } = await runOcr(state.imageData);
    state.ocrText = text;
    els.ocrText.textContent = text || "텍스트를 인식하지 못했습니다.";
    if (parsed.category) els.categoryInput.value = parsed.category;
    if (parsed.number) els.numberInput.value = parsed.number;
    els.ocrStatus.textContent = parsed.category && parsed.number ? "OCR 완료" : "직접 확인 필요";
    els.ocrStatus.classList.toggle("is-warning", !(parsed.category && parsed.number));
  } catch (error) {
    console.warn(error);
    state.ocrText = "OCR 처리 중 오류가 났습니다. 직접 입력해주세요.";
    els.ocrText.textContent = state.ocrText;
    els.ocrStatus.textContent = "직접 확인 필요";
    els.ocrStatus.classList.add("is-warning");
  }
});

els.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const category = normalizeCategory(els.categoryInput.value);
  const number = normalizeNumber(els.numberInput.value);
  if (!state.imageData || !category || !number) return;

  const submission = {
    id: createId(),
    nickname: state.user,
    category,
    number,
    value: els.valueInput.value.trim(),
    note: els.noteInput.value.trim(),
    imageData: state.imageData,
    ocrText: state.ocrText,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  try {
    await saveSubmission(submission);
    els.uploadForm.reset();
    resetUploadForm();
    state.activeTab = "board";
    render();
  } catch (error) {
    console.warn(error);
    alert("저장에 실패했습니다. Supabase 설정이나 저장 공간을 확인해주세요.");
  }
});

els.clearFormButton.addEventListener("click", () => {
  setTimeout(resetUploadForm, 0);
});

els.boardSearchInput.addEventListener("input", () => {
  state.search = els.boardSearchInput.value;
  renderBoard();
});

els.boardCategorySelect.addEventListener("change", () => {
  state.selectedCategory = els.boardCategorySelect.value;
  renderBoard();
});

els.boardGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='open-slot']");
  if (!button) return;
  const card = button.closest("[data-slot]");
  openSlot(card.dataset.slot);
});

els.reviewList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  if (button.dataset.action === "accept") {
    const group = getReviewGroups().find((item) => item.key === button.dataset.slot);
    if (!group) return;
    const rejectedIds = group.submissions.map((item) => item.id).filter((id) => id !== button.dataset.id);
    await updateStatuses(button.dataset.id, rejectedIds);
    return;
  }

  if (button.dataset.action === "reject") {
    await updateStatuses("", [button.dataset.id]);
  }
});

els.closeDialogButton.addEventListener("click", () => els.slotDialog.close());

async function init() {
  setupSupabase();
  state.user = localStorage.getItem(SESSION_KEY) || "";
  await loadSubmissions();
  render();
}

init();

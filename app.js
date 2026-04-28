const LOCAL_STORAGE_KEY = "chazm-hint-board-v2";
const SESSION_KEY = "chazm-hint-board-user";
const DEFAULT_SLOT_COUNT = 50;
const FIXED_CATEGORIES = ["1일차", "2일차", "3일차", "4일차", "5일차", "6일차", "견적분석", "친구초대"];
const MAX_IMAGE_SIZE = 1400;
const IMAGE_QUALITY = 0.84;

const config = window.HINT_BOARD_CONFIG || {};
const state = {
  user: "",
  submissions: [],
  imageData: "",
  ocrText: "",
  recognition: null,
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
  recognitionPanel: document.querySelector("#recognitionPanel"),
  recognizedCategory: document.querySelector("#recognizedCategory"),
  recognizedNumber: document.querySelector("#recognizedNumber"),
  recognizedKind: document.querySelector("#recognizedKind"),
  recognizedContent: document.querySelector("#recognizedContent"),
  hintBodyImage: document.querySelector("#hintBodyImage"),
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
    .replace(/^[^\w가-힣]+/g, "")
    .replace(/[\\/\u2215\u2044]+/g, " ")
    .replace(/[^\w가-힣\s.-]/g, "")
    .replace(/\s*No\s*\.?\s*\d+.*/i, "")
    .replace(/\s+[Nn]\s*$/, "")  // OCR이 No.를 N으로 잘못 읽은 경우 제거
    .trim();
}

// 저장된 raw 카테고리문자열을 FIXED_CATEGORIES 중 하나로 매핑
function matchFixedCategory(category) {
  const s = String(category || "").trim();
  if (!s) return s;
  // 1) 정확히 일치
  if (FIXED_CATEGORIES.includes(s)) return s;
  // 2) 고정 카테고리로 시작하는 경우 ("1일차 힌트 N" → "1일차")
  const byPrefix = FIXED_CATEGORIES.find((fc) => s.startsWith(fc));
  if (byPrefix) return byPrefix;
  // 3) 고정 카테고리를 포함하는 경우 ("견적분석 힌트" → "견적분석")
  const byInclude = FIXED_CATEGORIES.find((fc) => s.includes(fc));
  if (byInclude) return byInclude;
  return s;
}

function normalizeNumber(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : "";
}

function parseHeader(text) {
  const cleaned = String(text || "")
    .replace(/[|｜]/g, " ")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[Oo][.\s]*(\d)/g, "No.$1")
    .replace(/[NＮ][oO0Ｏ]\s*[.:：]?\s*/gi, "No.")
    .replace(/\s+/g, " ")
    .trim();

  const match = cleaned.match(/(.+?)\s*No\.?\s*(\d{0,3})/i);
  if (!match) return { category: "", number: "" };

  const category = normalizeCategory(match[1]);
  const number = normalizeNumber(match[2] || "1");
  return {
    category,
    number,
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
    state.submissions = Array.isArray(saved)
      ? saved.map((s) => ({ ...s, category: matchFixedCategory(s.category) }))
      : [];
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
    category: matchFixedCategory(row.category),  // raw OCR 값을 FIXED_CATEGORIES로 정규화
    number: row.hint_no,
    value: row.hint_value || "",
    contentKind: row.content_kind || "unknown",
    contentKey: row.content_key || "",
    bodyImageData: row.body_image_url || row.image_url || "",
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

function hashString(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function toStorageSegment(value, fallback = "hint") {
  const source = String(value || "").normalize("NFKC");
  const ascii = source
    .normalize("NFKC")
    .replace(/[\\/\u2215\u2044]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  if (/[^\x00-\x7F]/.test(source)) {
    return `${ascii || fallback}-${hashString(source)}`;
  }
  return ascii || `${fallback}-${hashString(source)}`;
}

function describeSupabaseError(error, step) {
  const message = error?.message || error?.error_description || error?.hint || JSON.stringify(error);
  return new Error(`${step} 실패: ${message}`);
}

async function saveSubmission(submission) {
  if (!state.supabase) {
    state.submissions.unshift(submission);
    saveLocalSubmissions();
    return;
  }

  let imageUrl = submission.imageData;
  if (submission.imageData.startsWith("data:")) {
    const categoryPath = toStorageSegment(submission.category, "category");
    const numberPath = toStorageSegment(submission.number, "number");
    const path = `${categoryPath}/${numberPath}/${submission.id}.jpg`;
    const { error: uploadError } = await state.supabase.storage
      .from("hint-images")
      .upload(path, dataUrlToBlob(submission.imageData), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (uploadError) throw describeSupabaseError(uploadError, "원본 이미지 업로드");
    const { data } = state.supabase.storage.from("hint-images").getPublicUrl(path);
    imageUrl = data.publicUrl;
  }

  let bodyImageUrl = submission.bodyImageData || imageUrl;
  if (bodyImageUrl.startsWith("data:")) {
    const categoryPath = toStorageSegment(submission.category, "category");
    const numberPath = toStorageSegment(submission.number, "number");
    const bodyPath = `${categoryPath}/${numberPath}/${submission.id}-body.jpg`;
    const { error: bodyUploadError } = await state.supabase.storage
      .from("hint-images")
      .upload(bodyPath, dataUrlToBlob(bodyImageUrl), {
        contentType: "image/jpeg",
        upsert: false,
      });
    if (bodyUploadError) throw describeSupabaseError(bodyUploadError, "힌트사진 영역 업로드");
    const { data } = state.supabase.storage.from("hint-images").getPublicUrl(bodyPath);
    bodyImageUrl = data.publicUrl;
  }

  const { error } = await state.supabase.from("hint_submissions").insert({
    id: submission.id,
    nickname: submission.nickname,
    category: submission.category,
    hint_no: submission.number,
    hint_value: submission.value,
    content_kind: submission.contentKind,
    content_key: submission.contentKey,
    body_image_url: bodyImageUrl,
    note: submission.note,
    image_url: imageUrl,
    ocr_text: submission.ocrText,
    status: submission.status,
  });
  if (error) throw describeSupabaseError(error, "제보 DB 저장");
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

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function isHintCardPixel(red, green, blue, alpha) {
  if (alpha < 200) return false;
  const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const isBrightNeutral = luma > 128 && saturation < 0.55;
  const isWarmCard = red > 165 && green > 115 && blue < 190;
  return isBrightNeutral || isWarmCard;
}

function longestTrueRun(values) {
  let bestStart = 0;
  let bestEnd = values.length - 1;
  let bestLength = 0;
  let start = -1;

  values.forEach((value, index) => {
    if (value && start === -1) start = index;
    if ((!value || index === values.length - 1) && start !== -1) {
      const end = value && index === values.length - 1 ? index : index - 1;
      const length = end - start + 1;
      if (length > bestLength) {
        bestStart = start;
        bestEnd = end;
        bestLength = length;
      }
      start = -1;
    }
  });

  return { start: bestStart, end: bestEnd, length: bestLength };
}

function findHintCardRect(img) {
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const rowCounts = new Array(height).fill(0);
  const colCounts = new Array(width).fill(0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isHintCardPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])) {
        rowCounts[y] += 1;
      }
    }
  }

  // 임계값 완화: 0.28 (이전 0.42) — 카드 안 이미지 삽입 시 변두리만 핑크인 행도 허용
  const rowMask = rowCounts.map((count) => count / width > 0.28);
  let yRun = longestTrueRun(rowMask);

  // 최소 연속 길이 완화: 7% (이전 18%) — 얇은 헤더 영역도 카드로 감지
  if (yRun.length < height * 0.07) {
    return { x: 0, y: 0, width: img.width, height: img.height };
  }

  // 최장 블록이 이미지 하단부에 있을 경우, 더 위쪽에 첫 번째 유효 블록이 있으면 그걸 우선
  // (모바일 전체 화면에서 카드 헤더가 항상 위쪽에 있기 때문)
  const firstRunStart = rowMask.findIndex((v) => v);
  if (firstRunStart !== -1 && firstRunStart < yRun.start - height * 0.1) {
    // 첫 블록이 최장 블록보다 유의미하게 위에 있으면 첫 번째 블록 계산
    let firstRunEnd = firstRunStart;
    while (firstRunEnd + 1 < height && rowMask[firstRunEnd + 1]) firstRunEnd += 1;
    const firstRunLength = firstRunEnd - firstRunStart + 1;
    if (firstRunLength >= height * 0.04) {
      yRun = { start: firstRunStart, end: firstRunEnd, length: firstRunLength };
    }
  }

  for (let y = yRun.start; y <= yRun.end; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (isHintCardPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3])) {
        colCounts[x] += 1;
      }
    }
  }

  const regionHeight = yRun.end - yRun.start + 1;
  // 임계값 완화: 0.24 (이전 0.38), 최소 너비 14% (이전 28%)
  const colMask = colCounts.map((count) => count / regionHeight > 0.24);
  const xRun = longestTrueRun(colMask);
  if (xRun.length < width * 0.14) {
    return { x: 0, y: 0, width: img.width, height: img.height };
  }

  return {
    x: Math.max(0, Math.round(xRun.start / scale)),
    y: Math.max(0, Math.round(yRun.start / scale)),
    width: Math.min(img.width, Math.round(xRun.length / scale)),
    height: Math.min(img.height, Math.round(yRun.length / scale)),
  };
}

async function cropHintHeader(dataUrl) {
  const img = await loadImage(dataUrl);
  const rect = findHintCardRect(img);
  const cropWidth = rect.width;
  const cropHeight = Math.min(rect.height, Math.max(120, Math.round(rect.height * 0.28)));
  const scale = Math.min(3, Math.max(1, 900 / cropWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cropWidth * scale);
  canvas.height = Math.round(cropHeight * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    img,
    rect.x,
    rect.y,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/png");
}

async function cropHintBody(dataUrl) {
  const img = await loadImage(dataUrl);
  const rect = findHintCardRect(img);
  const headerHeight = Math.round(rect.height * 0.26);
  const paddingX = Math.round(rect.width * 0.08);

  // findHintCardRect가 파스텔 헤더만 감지한 경우(height ≈ 헤더 스트립)
  // 실제 힌트 본문 이미지는 헤더 아래에 카드 너비만큼의 타원형으로 위치함
  // 헤더만 감지되면 rect.height < rect.width * 0.6 인 경우가 많음
  const headerOnlyDetected = rect.height < rect.width * 0.6;
  const estimatedTotalHeight = headerOnlyDetected
    ? Math.min(rect.width * 1.2, img.height - rect.y)  // 카드 너비 기준으로 확장
    : rect.height;                                       // 정상 감지된 전체 카드

  const paddingBottom = Math.round(estimatedTotalHeight * 0.04);
  const sourceX = rect.x + paddingX;
  const sourceY = rect.y + headerHeight;
  const sourceWidth = Math.max(1, rect.width - paddingX * 2);
  const sourceHeight = Math.max(
    1,
    Math.min(
      estimatedTotalHeight - headerHeight - paddingBottom,
      img.height - sourceY - 4,
    ),
  );
  const scale = Math.min(2, Math.max(1, 760 / sourceWidth));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

async function analyzeHintBody(bodyDataUrl) {
  const img = await loadImage(bodyDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = Math.max(1, Math.round((img.height / img.width) * canvas.width));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const total = pixels.length / 4;

  let darkPixels = 0;
  let lumaPrev = -1;
  let lumaVarianceSum = 0;  // 인접 픽셀 간 밝기 차이 합계
  let saturatedPixels = 0; // 체도 높은 픽셀 수 (사진에 많음)

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    if (luma < 75) darkPixels += 1;

    if (lumaPrev >= 0) lumaVarianceSum += Math.abs(luma - lumaPrev);
    lumaPrev = luma;

    // 체도 측정: max 채널과 min 채널의 차 / max
    const maxC = Math.max(red, green, blue);
    const minC = Math.min(red, green, blue);
    if (maxC > 30 && (maxC - minC) / maxC > 0.25) saturatedPixels += 1;
  }

  const darkRatio = darkPixels / total;
  const avgVariance = lumaVarianceSum / total; // 픽셀간 평균 밝기 진동
  const satRatio = saturatedPixels / total;    // 체도있는 픽셀 비율

  // 이미지 힙트 판단 조건 (상아→or 관계)
  // 1) 어두운 픽셔 많음 (김은 배경 사진)
  // 2) 픽셌간 밝기 변화가 큼음 (복잡한 사진)
  // 3) 체도있는 픽셌이 많음 (컴러 사진)
  const looksLikeImage =
    darkRatio > 0.13 ||
    avgVariance > 14 ||
    satRatio > 0.30;

  return { looksLikeImage };
}

async function hashImage(dataUrl) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const values = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    values.push(pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722);
  }
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map((value) => (value >= average ? "1" : "0")).join("");
}

async function binarizeForOcr(dataUrl) {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const scale = Math.min(3, Math.max(1, 1000 / img.width));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const lumas = [];

  for (let offset = 0; offset < pixels.length; offset += 4) {
    lumas.push(pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722);
  }

  const average = lumas.reduce((sum, value) => sum + value, 0) / lumas.length;
  const threshold = Math.max(85, Math.min(170, average - 28));

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luma = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
    const value = luma < threshold ? 0 : 255;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function normalizeContentText(value) {
  return String(value || "")
    .replace(/[^\w가-힣]/g, "")
    .trim()
    .toLowerCase();
}

async function runOcr(dataUrl) {
  if (!window.Tesseract) {
    return { text: "OCR 라이브러리를 불러오지 못했습니다. 종류와 번호를 직접 입력해주세요.", parsed: {} };
  }

  const crop = await cropHintHeader(dataUrl);
  const variants = [await binarizeForOcr(crop), crop];
  const attempts = [];

  for (const variant of variants) {
    const result = await window.Tesseract.recognize(variant, "kor+eng", {
      logger: (event) => {
        if (event.status === "recognizing text") {
          els.ocrStatus.textContent = `OCR ${Math.round(event.progress * 100)}%`;
        }
      },
      tessedit_pageseg_mode: "7",
    });
    const text = result.data.text.trim();
    const parsed = parseHeader(text);
    attempts.push({ text, parsed });
    if (parsed.category && parsed.number) return { text, parsed };
  }

  return attempts[0] || { text: "", parsed: {} };
}

async function recognizeHint(dataUrl) {
  const header = await runOcr(dataUrl);
  const bodyImageData = await cropHintBody(dataUrl);
  const bodyAnalysis = await analyzeHintBody(bodyImageData);

  if (bodyAnalysis.looksLikeImage) {
    const contentKey = `image:${await hashImage(bodyImageData)}`;
    return {
      ...header,
      bodyImageData,
      contentKind: "image",
      value: "이미지 힌트",
      contentKey,
    };
  }

  let bodyText = "";
  try {
    const bodyOcrImage = await binarizeForOcr(bodyImageData);
    // PSM 6: 균일한 텍스트 블록으로 인식 (단어 단위 PSM 8보다 한글 인식 정확도 높음)
    const bodyResult = await window.Tesseract.recognize(bodyOcrImage, "kor+eng", {
      tessedit_pageseg_mode: "6",
    });
    bodyText = bodyResult.data.text.trim();
  } catch (error) {
    console.warn(error);
  }

  const normalizedText = normalizeContentText(bodyText);
  return {
    ...header,
    bodyImageData,
    contentKind: "text",
    value: normalizedText || "글자 힌트",
    contentKey: `text:${normalizedText}`,
  };
}

async function processImageFile(file, sourceLabel = "이미지") {
  if (!file || !file.type.startsWith("image/")) return;

  els.ocrStatus.textContent = `${sourceLabel} 준비중`;
  els.ocrStatus.classList.remove("is-warning");
  state.imageData = await compressImage(file);
  els.imagePreview.src = state.imageData;
  els.previewCard.hidden = false;

  try {
    const recognition = await recognizeHint(state.imageData);
    state.recognition = recognition;
    state.ocrText = recognition.text;
    els.ocrText.textContent = recognition.text || "텍스트를 인식하지 못했습니다.";
    els.recognitionPanel.hidden = false;
    els.recognizedCategory.textContent = recognition.parsed.category || "인식 실패";
    els.recognizedNumber.textContent = recognition.parsed.number || "인식 실패";
    els.recognizedKind.textContent = recognition.contentKind === "image" ? "그림/사진" : "글자";
    els.recognizedContent.textContent = recognition.value || "인식 실패";
    els.hintBodyImage.src = recognition.bodyImageData;
    const complete = Boolean(recognition.parsed.category && recognition.parsed.number && recognition.contentKey);
    els.ocrStatus.textContent = complete ? "인식 완료" : "등록 불가";
    els.ocrStatus.classList.toggle("is-warning", !complete);
  } catch (error) {
    console.warn(error);
    state.recognition = null;
    state.ocrText = "OCR 처리 중 오류가 났습니다. 직접 입력해주세요.";
    els.ocrText.textContent = state.ocrText;
    els.recognitionPanel.hidden = true;
    els.ocrStatus.textContent = "등록 불가";
    els.ocrStatus.classList.add("is-warning");
  }
}

function userUploadCount() {
  return state.submissions.filter((submission) => submission.nickname === state.user && submission.status === "accepted").length;
}

function canViewBoard() {
  return state.isAdmin || userUploadCount() > 0;
}

function canViewCategory(category) {
  if (state.isAdmin) return true;
  return state.submissions.some(
    (s) =>
      matchFixedCategory(s.category) === category &&
      s.nickname === state.user &&
      s.status === "accepted",
  );
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

function hammingDistance(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function isSameContent(left, right) {
  if (!left?.contentKey || !right?.contentKey) return false;
  if (left.contentKind !== right.contentKind) return false;
  if (left.contentKind === "image") {
    return hammingDistance(left.contentKey.replace("image:", ""), right.contentKey.replace("image:", "")) <= 18;
  }
  return left.contentKey === right.contentKey;
}

function getSlotSubmissions(category, number) {
  return getVisibleSubmissions().filter(
    (submission) => submission.category === category && Number(submission.number) === Number(number),
  );
}

function decideSubmissionStatus(submission) {
  const existing = getSlotSubmissions(submission.category, submission.number);
  if (existing.length === 0) return "accepted";
  return existing.some((item) => isSameContent(item, submission)) ? "accepted" : "pending";
}

function getSlotState(submissions) {
  const accepted = submissions.find((submission) => submission.status === "accepted");
  if (accepted && submissions.every((submission) => isSameContent(accepted, submission))) {
    return { status: "확정", submission: accepted, review: false };
  }
  if (submissions.length > 1 || !accepted) return { status: "검증중", submission: accepted || submissions[0], review: true };
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
  els.categoryList.innerHTML = FIXED_CATEGORIES.map((category) => {
    const accessible = canViewCategory(category);
    const isActive = state.selectedCategory === category;
    return `<button
      class="category-item${isActive ? " is-active" : ""}${!accessible ? " is-locked" : ""}"
      type="button"
      data-category="${escapeHtml(category)}"
      ${!accessible ? "disabled" : ""}
    >
      <span class="category-name">${escapeHtml(category)}</span>
      ${!accessible ? `<span class="lock-icon" aria-hidden="true">🔒</span>` : ""}
    </button>`;
  }).join("");
}

function renderBoard() {
  // 선택된 카테고리가 없거나 접근 불가이면 첫 번째 접근 가능 카테고리로 자동 이동
  if (!state.selectedCategory || !canViewCategory(state.selectedCategory)) {
    state.selectedCategory = FIXED_CATEGORIES.find(canViewCategory) || "";
  }

  const allowed = canViewBoard();
  els.lockedState.hidden = allowed;
  els.boardGrid.hidden = !allowed;
  els.boardTitle.textContent = state.selectedCategory ? `${state.selectedCategory} 보드` : "힌트 보드";

  if (!allowed) {
    els.boardGrid.innerHTML = "";
    return;
  }

  if (!state.selectedCategory) {
    els.boardGrid.innerHTML = `<p class="locked-state"><strong>왼쪽에서 카테고리를 선택해주세요.</strong></p>`;
    return;
  }

  if (!canViewCategory(state.selectedCategory)) {
    els.boardGrid.innerHTML = `<p class="locked-state"><strong>이 카테고리는 해당 힌트를 제보한 뒤 열람할 수 있습니다.</strong></p>`;
    return;
  }

  const slots = getBoardItems();
  els.boardGrid.innerHTML =
    slots
      .map((slot) => {
        if (slot.empty) {
          return `<article class="slot-card is-empty"><div class="slot-placeholder"><span class="slot-number">No.${slot.number}</span></div></article>`;
        }
        const submission = slot.submission;
        const reviewClass = slot.review ? " is-review" : "";
        return `
          <article class="slot-card${reviewClass}" data-slot="${escapeHtml(slot.key)}">
            <div class="slot-image-wrap">
              <img class="slot-image" src="${escapeHtml(submission.bodyImageData || submission.imageData)}" alt="${escapeHtml(slot.category)} No.${slot.number}" loading="lazy" />
              <span class="slot-badge">No.${slot.number}</span>
              ${slot.review ? `<span class="slot-review-badge">검증중</span>` : ""}
            </div>
          </article>
        `;
      })
      .join("") || `<p class="locked-state"><strong>아직 제보가 없습니다.</strong></p>`;
}

function getReviewGroups() {
  return [...getSlotMap().entries()]
    .map(([key, submissions]) => {
      const [category, numberText] = key.split("::");
      const accepted = submissions.find((submission) => submission.status === "accepted");
      return {
        key,
        category,
        number: Number(numberText),
        submissions,
        needsReview: accepted
          ? submissions.some((submission) => !isSameContent(accepted, submission))
          : submissions.length > 1,
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
                <img src="${escapeHtml(submission.bodyImageData || submission.imageData)}" alt="${escapeHtml(group.category)} No.${group.number} 후보" />
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
  state.recognition = null;
  els.previewCard.hidden = true;
  els.recognitionPanel.hidden = true;
  els.imagePreview.removeAttribute("src");
  els.hintBodyImage.removeAttribute("src");
  els.ocrText.textContent = "아직 인식 전입니다.";
  els.ocrStatus.textContent = "OCR 대기";
  els.ocrStatus.classList.remove("is-warning");
  els.recognizedCategory.textContent = "-";
  els.recognizedNumber.textContent = "-";
  els.recognizedKind.textContent = "-";
  els.recognizedContent.textContent = "-";
}

function openSlot(slotKey) {
  const slot = getFilteredSlots().find((item) => item.key === slotKey);
  if (!slot) return;

  const submission = slot.submission;
  els.slotDialogContent.innerHTML = `
    <div class="slot-detail">
      <img src="${escapeHtml(submission.bodyImageData || submission.imageData)}" alt="${escapeHtml(slot.category)} No.${slot.number}" />
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
    if (tab.dataset.tab === "board" && !canViewCategory(state.selectedCategory)) {
      state.selectedCategory = FIXED_CATEGORIES.find(canViewCategory) || "";
    }
    render();
  });
});

els.imageInput.addEventListener("change", async () => {
  const [file] = els.imageInput.files;
  if (!file) {
    resetUploadForm();
    return;
  }

  await processImageFile(file, "이미지");
});

document.addEventListener("paste", async (event) => {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (!imageItem || !state.user) return;

  const file = imageItem.getAsFile();
  if (!file) return;
  event.preventDefault();
  state.activeTab = "upload";
  render();
  await processImageFile(file, "붙여넣기 이미지");
});

els.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const recognition = state.recognition;
  const category = matchFixedCategory(normalizeCategory(recognition?.parsed.category));
  const number = normalizeNumber(recognition?.parsed.number);
  if (!state.imageData || !recognition?.contentKey || !category || !number) {
    alert("힌트 종류, 번호, 내용을 모두 인식한 뒤 등록할 수 있습니다.");
    return;
  }
  if (number < 1 || number > DEFAULT_SLOT_COUNT) {
    alert(`No.${number}은 등록할 수 없는 번호입니다. 힌트 번호는 1~${DEFAULT_SLOT_COUNT} 범위여야 합니다.`);
    return;
  }

  const submission = {
    id: createId(),
    nickname: state.user,
    category,
    number,
    value: recognition.value,
    contentKind: recognition.contentKind,
    contentKey: recognition.contentKey,
    bodyImageData: recognition.bodyImageData,
    note: "",
    imageData: state.imageData,
    ocrText: state.ocrText,
    status: "",
    createdAt: new Date().toISOString(),
  };
  submission.status = decideSubmissionStatus(submission);

  try {
    await saveSubmission(submission);
    els.uploadForm.reset();
    resetUploadForm();
    state.activeTab = "board";
    render();
  } catch (error) {
    console.warn(error);
    alert(`저장에 실패했습니다.\n\n${error?.message || "Supabase 설정이나 저장 공간을 확인해주세요."}`);
  }
});

els.clearFormButton.addEventListener("click", () => {
  setTimeout(resetUploadForm, 0);
});

els.boardSearchInput.addEventListener("input", () => {
  state.search = els.boardSearchInput.value;
  renderBoard();
});

els.boardGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-slot]");
  if (!card) return;
  openSlot(card.dataset.slot);
});

els.categoryList.addEventListener("click", (event) => {
  const button = event.target.closest(".category-item:not([disabled])");
  if (!button) return;
  state.selectedCategory = button.dataset.category;
  state.activeTab = "board";
  render();
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

# 차즘 힌트 보드

참여자가 직접 올린 힌트 이미지를 OCR로 읽어 `힌트 종류 + No.번호` 칸에 자동 배치하는 웹 MVP입니다.

## 바로 보기

브라우저에서 아래 파일을 열면 됩니다.

`C:\Users\User\Documents\Codex\2026-04-27\new-chat\index.html`

## 현재 기능

- 차즘 자동 생성 닉네임으로 비밀번호 없는 로그인
- 이미지 업로드 후 좌측 상단 문구 OCR 시도
- OCR 결과를 업로드 전 직접 보정 가능
- 종류별, 번호별 보드 자동 배치
- 종류를 선택하면 No.1부터 기본 60칸까지 표시
- 같은 종류와 같은 번호에 여러 이미지가 올라오면 `검증중` 표시
- 관리자 모드에서 후보 이미지 중 하나를 확정
- 이미지를 1개 이상 올린 닉네임만 보드 화면 열람
- Supabase anon key는 로컬 전용 `config.local.js`에서만 사용

## Supabase 설정

1. Supabase SQL Editor에서 `supabase-schema.sql`을 실행합니다.
2. `config.local.js`를 만들고 anon key를 넣습니다. 이 파일은 GitHub에 올리지 않습니다.
3. 운영 전에는 `ADMIN_CODE`를 반드시 바꿔주세요.

```js
window.HINT_BOARD_CONFIG = {
  SUPABASE_URL: "https://vnpcqikgrdluzpcywvee.supabase.co",
  SUPABASE_PUBLISH_KEY: "여기에 anon key",
  ADMIN_CODE: "검증용 관리자 코드",
};
```

## 공개 키 처리

Supabase anon key는 브라우저 앱에서 공개되는 것을 전제로 한 키라 비밀키는 아닙니다. 하지만 RLS 정책이 느슨하면 이 키로 데이터 조회, 삽입, 수정이 가능해질 수 있습니다. 그래서 저장소에는 anon key를 커밋하지 않고, 로컬에서는 `config.local.js`로만 주입합니다.

## GitHub 작업 메모

현재 폴더는 아직 GitHub 저장소와 연결되어 있지 않습니다. GitHub repo URL을 받으면 이 폴더를 git 저장소로 초기화하고, 작업 완료 시마다 README를 갱신한 뒤 commit/push하는 흐름으로 진행합니다.

## 중요한 보안 메모

닉네임만 받는 방식은 진짜 인증이 아닙니다. 지금 구현의 보드 잠금과 관리자 코드는 MVP용 클라이언트 제어입니다. 공개 운영에서 조작을 제대로 막으려면 Supabase Auth, 관리자 계정, 또는 Edge Function으로 검증 API를 따로 잠그는 구성이 필요합니다.

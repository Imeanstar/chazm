# 차즘 힌트 보드

참여자가 직접 올린 힌트 이미지를 OCR로 읽어 `힌트 종류 + No.번호` 칸에 자동 배치하는 웹 MVP입니다.

## 바로 보기

브라우저에서 아래 파일을 열면 됩니다.

`C:\Users\User\Documents\Codex\2026-04-27\new-chat\index.html`

GitHub Pages 배포가 끝나면 아래 주소에서도 볼 수 있습니다.

https://imeanstar.github.io/chazm/

## 현재 기능

- 차즘 자동 생성 닉네임으로 비밀번호 없는 로그인
- 이미지 업로드 후 좌측 상단 문구 OCR 시도
- 모바일 전체 화면 캡처에서도 실제 힌트 카드 영역을 찾아 해당 카드 상단만 OCR
- 분홍, 주황 등 색 있는 카드도 흑백 고대비 전처리 후 OCR
- OCR 결과에 한글, `/` 같은 문자가 섞여도 Supabase Storage 경로는 ASCII 안전 값으로 변환
- 파일 선택뿐 아니라 클립보드 이미지 붙여넣기 지원
- 힌트 종류, No., 힌트사진 내용을 인식 결과로만 표시하고 제보자는 수정 불가
- 글자 힌트는 본문 글자 OCR, 그림 힌트는 힌트사진 영역 캡처와 이미지 해시로 비교
- 종류별, 번호별 보드 자동 배치
- 종류를 선택하면 No.1부터 기본 60칸까지 표시
- 같은 종류와 번호가 비어 있으면 바로 확정
- 같은 종류와 번호가 이미 있고 내용이 같으면 제보자에게 열람 권한 부여
- 같은 종류와 번호가 이미 있고 내용이 다르면 `검증중` 표시
- 관리자 모드에서 후보 이미지 중 하나를 확정
- 이미지를 1개 이상 올린 닉네임만 보드 화면 열람
- Supabase anon key는 로컬 전용 `config.local.js`에서만 사용

## Supabase 설정

1. Supabase SQL Editor에서 `supabase-schema.sql`을 실행합니다.
2. `config.local.js`를 만들고 anon key를 넣습니다. 이 파일은 GitHub에 올리지 않습니다.
3. 운영 전에는 `ADMIN_CODE`를 반드시 바꿔주세요.

저장 실패가 나면 앱이 실패 단계와 Supabase 에러 메시지를 같이 보여줍니다. `supabase-schema.sql`은 기존 `hint-images` 버킷 설정도 다시 맞추므로, 스키마가 바뀐 뒤에는 한 번 더 실행해주세요.

```js
window.HINT_BOARD_CONFIG = {
  SUPABASE_URL: "https://vnpcqikgrdluzpcywvee.supabase.co",
  SUPABASE_PUBLISH_KEY: "여기에 anon key",
  ADMIN_CODE: "검증용 관리자 코드",
};
```

## 공개 키 처리

Supabase anon key는 브라우저 앱에서 공개되는 것을 전제로 한 키라 비밀키는 아닙니다. 하지만 RLS 정책이 느슨하면 이 키로 데이터 조회, 삽입, 수정이 가능해질 수 있습니다. 그래서 저장소에는 anon key를 커밋하지 않고, 로컬에서는 `config.local.js`로만 주입합니다.

GitHub Pages에서 Supabase를 연결하려면 GitHub 저장소의 Actions secret에 `SUPABASE_PUBLISH_KEY`를 추가합니다. 배포 워크플로가 이 secret으로 `config.local.js`를 생성하므로 git 히스토리에는 key가 남지 않습니다.

## GitHub 작업 메모

이 폴더는 `https://github.com/Imeanstar/chazm.git` 저장소와 연결되어 있습니다. 작업 완료 시마다 README를 갱신한 뒤 commit/push하는 흐름으로 진행합니다.

## 중요한 보안 메모

닉네임만 받는 방식은 진짜 인증이 아닙니다. 지금 구현의 보드 잠금과 관리자 코드는 MVP용 클라이언트 제어입니다. 공개 운영에서 조작을 제대로 막으려면 Supabase Auth, 관리자 계정, 또는 Edge Function으로 검증 API를 따로 잠그는 구성이 필요합니다.

# 시안에서 코드 시편, 채택한 전체 화면까지

시안 이미지의 사본을 가져와 코드로 비교하고 수정한다. 일반 시편과 기존 선택 기록은 그대로 사용한다.

## 저장과 역할

- 기능 코드는 Tastepin이 소유한다.
- 개인 자료는 `TASTEPIN_DATA/studies/<id>/`에 둔다. `reference/`는 원본 사본, `revisions/<버전>/`은 코드와 자산 및 독립 실행 HTML, `exports/<채택 ID>/`는 전체 화면 캡처와 내보내기 자료다.
- 평가, 수정 요청, 채택과 되돌리기는 `TASTEPIN_DATA/state/study-events.jsonl`에 소유 CLI와 API만 기록한다. 기존 `judgments.jsonl`, `rules.json`에 선택을 복제하지 않는다.
- 수정본을 등록한 뒤에는 덮어쓰지 않는다. 새 수정본 ID를 사용한다. 코드, CSS나 자산이 달라지면 설명 문장이 같아도 이전 평가를 재사용하지 않는다.
- React 시편은 기존 Lab의 Vite로 독립 HTML을 만든다. 실행 화면에는 네트워크 요청을 막는 정책을 넣고 Lab에서는 별도 프레임으로 실행한다. 이것은 신뢰하지 않는 코드를 안전한 코드로 바꾸는 검사가 아니다. AI가 작성한 소스와 의존성을 확인한 뒤 등록한다.

## 자료 가져오기

`reference.json`과 PNG를 같은 폴더에 두고 아래 형식으로 준비한다. `source`와 `selection`은 출처가 있을 때만 적으며, AI가 사용자의 선택을 만들어 넣지 않는다.

```json
{
  "format_version": 1,
  "kind": "ui-reference",
  "title": "컬렉션 목록",
  "source": {"provider": "local-image"},
  "selection": {"user_statement": "", "scope": "비교 후보"},
  "notes": "사용자 평가와 AI의 관찰을 구분해 적는다.",
  "image": {"file": "reference.png", "width": 941, "height": 1671, "sha256": "파일의 SHA-256"}
}
```

```sh
python3 -B taste.py study import collection /path/to/reference-bundle
```

이미지는 4 MiB, 파일 하나는 16 MiB, 묶음은 64 MiB까지다. 손상과 숨김 파일, 상위 경로, 링크는 거부한다. 같은 내용의 가져오기는 중복 생성하지 않는다. 같은 ID의 다른 원본은 새 시안 ID로 가져온다.

## 코드 시편과 수정본

AI가 작업 폴더에 `Screen.tsx`, CSS와 필요한 자산, `revision.json`을 작성한다. 기본 내보내기는 `{params, theme}`를 받는 React 컴포넌트다. 상대 파일과 기존 React, React DOM, Motion, Lucide만 불러올 수 있다. 모든 소스와 자산을 `files`에 명시한다. 외부 이미지나 글꼴 대신 등록한 로컬 자산을 쓴다.

CSS의 `@import`와 `url()`도 등록한 파일만 가리켜야 한다. 자산은 정적 `import`로 불러온다. Vite가 별도 경로로 파일을 읽을 수 있는 `import.meta` 사용은 지원하지 않으므로 `new URL(..., import.meta.url)`과 `import.meta.glob`도 사용할 수 없다.

```json
{
  "format_version": 1,
  "id": "r1",
  "entry": "Screen.tsx",
  "files": ["Screen.tsx", "style.css"],
  "viewport": {"width": 390, "height": 760},
  "theme": "dark",
  "state": "목록 첫 화면. 대체한 자산과 실제로 구현하지 않은 동작도 적는다.",
  "dimensions": [{"id": "gap", "label": "행 사이 간격", "values": [
    {"id": "compact", "label": "촘촘하게", "spec": "행 사이 12px"},
    {"id": "roomy", "label": "여유 있게", "spec": "행 사이 22px"}
  ]}]
}
```

```sh
python3 -B taste.py study register collection /path/to/draft
python3 -B taste.py lab --study collection
```

먼저 원본과 재현을 확인한다. 그 뒤 같은 콘텐츠의 비교에서 고르고, 수정할 부분은 Lab에 기록한다. AI는 `study show collection`으로 현재 버전과 요청을 읽고, 새 작업 폴더에서 수정본을 작성한다. 기존 폴더를 직접 고치지 않는다. `r2`처럼 새 ID로 등록하면 이전 화면과 비교할 수 있다. 수정본 하나만 추가해도 이전 화면을 기준으로 확인할 수 있다.

화면의 비교 선택은 기록일 뿐 적용이 아니다. 최종 조합을 **원본과 비교** 보기에서 확인한 뒤 **채택**을 누른다. 재현 확인, 선택과 채택은 사용자가 한다. 에이전트가 구현 검사 결과를 사용자 만족으로 대신 기록하지 않는다.

## 채택한 결과 적용과 되돌리기

```sh
python3 -B taste.py apply-context --surface codex --study collection --request "이 컬렉션 화면 구현"
python3 -B taste.py apply /path/to/project --study collection
python3 -B taste.py apply /path/to/project --study collection --check
```

`--study`를 생략하면 기존 취향만 사용한다. 시안의 선택은 화면 하나에만 적용하며 공통 CSS 값에 자동 합치지 않는다. 프로젝트 사본은 `.taste/studies/<id>/`의 설명, 선택 값과 독립 실행 화면 및 소스를 포함한다. 전체 평가 원문은 포함하지 않는다. 다른 프로젝트로 내보내는 파일에는 개인 선택이 있으므로 공개 요청과 구분한다.

수정 중에는 이전 채택을 유지한다. Lab에서 다른 버전을 채택하거나 이전 채택으로 되돌릴 수 있다. 채택 해제 후에는 해당 시안을 적용하는 명령이 실패하며 오래된 결과를 대신 쓰지 않는다. 프로젝트에 이미 저장한 사본은 자동 동기화하지 않는다. 다시 내보내거나 확인 명령으로 차이를 확인한다.

## 전체 화면 레퍼런스와 피드백 내보내기

```sh
python3 -B taste.py study export collection /path/to/adopted-reference
python3 -B taste.py study feedback-export collection /path/to/revision-request
```

전체 화면 내보내기는 채택한 코드 버전과 모든 선택 값을 사용해 설치된 Chrome으로 PNG를 캡처한다. Chrome 경로는 `--chrome`으로 지정할 수 있다. 새 브라우저나 패키지는 설치하지 않는다. 표시 상태는 `revision.json`의 초기 상태이며 클릭 중간이나 재생 중간 상태를 자동 복원하지 않는다. 그러한 화면을 보관하려면 초기 상태를 재현하는 새 수정본을 만든다.

내보내기 도중 다른 결과를 채택하더라도 이미지, 선택값과 설명은 시작할 때 읽은 같은 채택을 사용한다. React 화면이 반영된 뒤 이미지와 글꼴 준비를 기다리며, 렌더나 실행 오류가 발생하면 PNG와 채택별 캐시를 저장하지 않는다.

`reference.json`, `screen.png`, `implementation/`을 함께 보관한다. `implementation/screen.html`은 채택한 값이 들어 있어 도구가 없는 환경에서도 열 수 있다. 코드는 수정에, PNG는 다음 디자인의 레퍼런스로 쓴다. 같은 채택을 다시 내보내면 처음 캡처한 자료를 사용한다. 화면 캡처는 사용자 만족이나 실제 기기 검증을 뜻하지 않는다.

`implementation/revision/`은 등록 당시 코드와 실행 화면 및 해시를 그대로 보존한다. 채택한 값이 들어간 실행 화면과 원본 수정본을 따로 두어 원본 해시도 다시 확인할 수 있다.

피드백 내보내기는 해당 시안의 평가 원문과 수정 요청을 포함한다. 필요한 시안만 지정하고 다른 개인 원장은 포함하지 않는다. 새 시안을 만드는 자료이며 자동 생성이나 자동 등록은 하지 않는다.

## 기록 API

CLI의 `study event`는 stdin JSON을 받으며 Lab의 `POST /api/studies/event`와 같은 검증을 사용한다. `study show <id>`의 `expected`를 현재 이력으로, 수정본의 `digest`를 보고 있는 코드로 보낸다. `request_id`는 요청마다 생성한 UUID이며 재시도에는 같은 내용과 ID를 사용한다. 다른 창에서 기록이 바뀌면 먼저 상태를 다시 읽는다. `reproduction`, `judge`, `feedback`, `adopt`, `revert`가 지원된다. `params`는 모든 비교 항목의 유효한 값을 포함한다. `revert.target`은 이전 채택 ID이며 `null`이면 해제한다.

새 이벤트는 지원하는 필드만 받으며 직렬화한 요청을 32 KiB로 제한한다. 누적 원장은 자산의 16 MiB 제한과 별개로 행을 순서대로 읽는다. 기존의 큰 기록도 보존하며, 새 행을 저장할 때 기존 바이트를 복사한 임시 파일을 원자적으로 교체한다.

## 검사

```sh
python3 -B -m unittest discover -s tests -v
node --test lab/scripts/study-build.test.mjs
node --test lab/scripts/study-runtime.test.mjs
cd lab
corepack pnpm build
```

런타임 검사는 설치된 Chrome을 사용하며 `STUDY_CHROME`으로 경로를 지정할 수 있다. 브라우저 경쟁 조건 검사는 Playwright가 준비된 Python으로 `tests/browser/study_races.py`를 실행한다. 별도 Vite 주소를 `STUDY_LAB_URL`로 지정하며 기본값은 `http://127.0.0.1:5187`이다. 이 검사는 API 응답을 대체하므로 개인 원장에 기록하지 않는다.

macOS를 우선 검사한다. Windows의 기존 원장 잠금 제한은 그대로이며 이 기능의 실제 Windows 실행과 Chrome 경로는 별도 확인 대상이다.

# Tastepin

내 디자인 취향을 고르고, 기억하고, 코드에 적용하는 로컬 도구입니다.

Lab에서 같은 화면의 간격, 모서리, 글꼴, 움직임을 하나씩 비교합니다. 고른 값과 화면을 보며 남긴 피드백은 로컬에 저장됩니다. 스킬은 다음 UI 작업에서 그 취향을 읽고, 검사기는 선택한 값으로 측정 가능한 부분을 확인합니다.

처음에는 취향이 비어 있습니다. Lab의 비교 예제는 선택 후보이며, 작성자의 취향이 사용자 기본값으로 들어가지는 않습니다. 현재 UI와 피드백 분류는 한국어 중심입니다.

## 시작하기

Python 3.11 이상, Node.js 24 이상, Corepack이 필요합니다. 압축된 Codex 대화 기록을 수집할 때만 Python 3.14 이상이 필요합니다. Python CLI는 표준 라이브러리를 사용합니다. 브라우저 검사에는 별도로 uv와 Playwright Chromium이 필요합니다.

저장소 루트에서 실행합니다.

```sh
cd lab
corepack pnpm install --frozen-lockfile
cd ..
python3 -B taste.py lab
```

Lab은 `http://127.0.0.1:5181/specimens`, 기록을 저장하는 대시보드는 `http://127.0.0.1:4871`에서 실행됩니다. `A`, `B`, `C`로 선택하고 `Enter`로 저장합니다. `D`는 다크 모드, `M`은 휴대폰 폭, `Space`는 움직임 재생입니다. 차이가 없거나 모두 마음에 들지 않는다는 답도 남길 수 있습니다.

```sh
python3 -B taste.py open                  # 대시보드
python3 -B taste.py status                # 선택과 기록 현황
python3 -B taste.py apply-context --surface codex --request "설정 화면 만들기"
python3 -B taste.py tokens --out ./tokens # CSS, Tailwind, Motion 파일
python3 -B taste.py stop                  # 이 사본이 시작한 서버 종료
```

`lab`은 의존성을 자동 설치하지 않습니다. 서버 포트가 이미 다른 프로그램에서 쓰이고 있으면 먼저 해당 프로그램의 상태를 확인하세요. CLI 파일명 `taste.py`와 `.taste/` 출력 형식은 기존 구현과 호환되도록 유지했습니다.

## 스킬로 사용하기

스킬 원본은 [`skills/tastepin/SKILL.md`](skills/tastepin/SKILL.md)입니다. 설치 경로는 고정되어 있지 않습니다. 에이전트 실행 환경에 `TASTEPIN_ROOT`를 이 저장소의 절대 경로로 설정하세요.

```sh
export TASTEPIN_ROOT="$PWD"
mkdir -p "$HOME/.agents/skills"
ln -s "$TASTEPIN_ROOT/skills/tastepin" "$HOME/.agents/skills/tastepin"
```

이미 설치된 경로가 있으면 위 명령은 덮어쓰지 않습니다. 설정을 유지하려면 사용하는 셸이나 에이전트 실행 환경에 환경변수를 등록합니다. Codex에서는 `$tastepin 설정 화면 만들어줘`처럼 명시적으로 호출합니다. 스킬은 취향을 읽고 원래 요청한 작업을 이어갑니다.

다른 머신에서 적용할 취향을 작업 저장소에 남기려면 다음을 실행합니다. 개인 취향과 규칙이 출력 파일에 포함되므로 공개할 저장소에서는 내용을 먼저 검토하세요.

```sh
python3 -B taste.py apply /path/to/project
python3 -B taste.py apply /path/to/project --check
```

이 명령은 `.taste/`와 `.agents/skills/tastepin/`을 쓰고, 기존 지침 파일에 취향 사본 위치를 안내합니다. Git 명령은 실행하지 않습니다. 원장이 없는 환경에서는 스킬이 `.taste/AGENT.md`를 읽습니다.

## 피드백과 개인정보

대화 기록 수집과 에이전트 훅 설치는 기본 실행에 포함되지 않습니다. 직접 남길 때는 다음처럼 실행합니다.

```sh
printf '%s\n' '버튼 사이 간격이 너무 좁아요' | python3 -B taste.py record --surface codex
```

기존 대화 기록을 읽으려는 경우에만 `python3 -B taste.py harvest` 또는 `open --harvest`를 사용합니다. 수집 대상은 로컬 Claude Code와 Codex 대화 기록이며, 해당 CLI를 실행하지는 않습니다. `effect --since YYYY-MM-DD`는 사용 시작일 전후의 대화 기록을 다시 읽는 선택 기능입니다. 비교 결과만으로 디자인 품질 개선을 증명하지는 않습니다.

- `state/`: 선택, 피드백 원문 일부, 세션 식별자, 작업 경로와 실행 기록.
- `data/rules.json`: 사용자가 저장한 개인 규칙. 파일이 없으면 빈 규칙으로 시작합니다.
- `TASTE.md`: 규칙과 근거 인용을 포함하는 생성 문서.

위 파일은 `.gitignore`로 제외합니다. 기본 실행은 이 저장소 밖의 기존 taste 원장을 읽거나 변경하지 않습니다. Lab은 서체 비교를 위해 Google Fonts와 jsDelivr에서 글꼴을 불러오므로 완전한 오프라인 화면은 아닙니다. 대화나 선택 기록을 그곳으로 보내지는 않습니다.

`data/symptoms.json`은 한국어 표현을 진단과 수정 제안에 연결하는 기본 사전입니다. 확정 취향이 아니며, 해석이 틀리면 대시보드에서 분류하거나 수정합니다.

## 브라우저 검사

uv가 설치된 환경에서 Playwright의 Chromium을 준비합니다. 기존 브라우저 캐시를 정리하지 않도록 `--no-remove`를 사용합니다.

```sh
uv run --with playwright python -m playwright install --no-remove chromium
python3 -B taste.py lint http://localhost:3000
```

검사는 라이트, 다크, 휴대폰 조건에서 현재 선택과 기본 오류를 확인합니다. 아직 고르지 않은 취향은 임의의 값으로 판정하지 않습니다. JS로 실행되는 모션의 실제 길이와 연속성, 캔버스와 이미지 속 글자 등은 측정하지 못합니다. 결과 끝의 수동 확인 항목도 검토해야 합니다.

## 개발과 검증

```sh
python3 -B -m unittest discover -s tests -v
cd lab
corepack pnpm build
```

Python 검사는 임시 원장과 카탈로그를 사용합니다. 브라우저가 필요한 검사는 uv나 Chromium이 없으면 건너뛴 사실을 출력합니다. Lab의 개발 서버만 실행하려면 기록 서버를 먼저 `python3 -B taste.py open --no-browser`로 시작한 뒤 `lab/`에서 `corepack pnpm dev`를 실행합니다.

지원 범위는 macOS와 Linux입니다. Windows의 파일 잠금과 프로세스 종료는 아직 지원하지 않습니다. 훅 명령은 코드에 포함되어 있지만, 이 첫 공개용 구성에서는 자동 설치하지 않습니다.

## 라이선스

[MIT](LICENSE). React, Motion, Lucide 등 의존성과 외부 글꼴은 각 프로젝트의 라이선스를 따릅니다.

# Tastepin

내 디자인 취향을 고르고, 기억하고, 코드에 적용하는 도구입니다.

1. **Lab에서 취향을 고릅니다.** 여러 컴포넌트의 디자인 시안을 비교하고, 마음에 드는 것을 선택합니다.
2. **스킬로 취향을 적용합니다.** UI 작업을 할 때 `tastepin` 스킬을 부르면 저장된 취향을 사용합니다.

Lab에서 고른 값과 직접 남긴 피드백은 로컬에 저장됩니다. 이미 구현된 화면도 자신의 취향을 기준으로 검사할 수 있습니다.

## 시작하기

```text
python >= 3.11 (압축된 Codex 대화 기록 수집 시 >= 3.14)
nodejs >= 24
pnpm
uv (브라우저 검사)
playwright (브라우저 검사)
Google Chrome >= 156.0.8078.79 (브라우저 검사)
```

### 1. Lab에서 취향 고르기

저장소 루트에서 실행한 뒤, Lab에서 마음에 드는 시안을 고르고 저장합니다.

```sh
cd lab
pnpm install --frozen-lockfile
cd ..
python3 -B taste.py lab
```

Lab: `http://127.0.0.1:5181/specimens`

### 2. 스킬로 취향 적용하기

저장소 루트에서 [tastepin 스킬](skills/tastepin/SKILL.md)을 연결합니다.

```sh
export TASTEPIN_ROOT="$PWD"
mkdir -p "$HOME/.agents/skills"
ln -s "$TASTEPIN_ROOT/skills/tastepin" "$HOME/.agents/skills/tastepin"
```

- `TASTEPIN_ROOT`는 Tastepin 저장소의 절대 경로입니다. 계속 사용하려면 셸이나 에이전트 실행 환경에 등록합니다.
- Codex에서 아래처럼 호출하면 저장된 취향을 읽고 작업에 적용합니다.

```text
$tastepin 설정 화면 만들어줘
```

## 기타 명령

대시보드: `http://127.0.0.1:4871`

```sh
python3 -B taste.py open                  # 대시보드
python3 -B taste.py status                # 선택과 기록 현황
python3 -B taste.py apply-context --surface codex --request "설정 화면 만들기"
python3 -B taste.py tokens --out ./tokens # CSS, Tailwind, Motion 파일
python3 -B taste.py stop                  # 이 사본이 시작한 서버 종료
```

## 다른 머신에서 사용하기

작업 저장소에 취향 사본과 스킬을 저장합니다.

```sh
python3 -B taste.py apply /path/to/project         # 사본 저장
python3 -B taste.py apply /path/to/project --check # 현재 취향과 일치하는지 확인
```

- `.taste/`: 취향 사본. Tastepin을 실행할 수 없는 환경에서는 스킬이 `.taste/AGENT.md`를 읽습니다.
- `.agents/skills/tastepin/`: 작업 저장소에서 사용할 스킬.
- 저장소 지침 파일에는 취향 사본의 위치를 추가합니다. 지침 파일이 없으면 생성합니다.
- 사본에는 개인 취향과 규칙이 포함됩니다. 공개할 때는 내용을 먼저 확인하세요.

## 피드백 기록하기

화면에 대한 피드백을 직접 남깁니다.

```sh
printf '%s\n' '버튼 사이 간격이 너무 좁아요' | python3 -B taste.py record --surface codex
```

기존 대화에서 피드백을 모으려면 다음을 실행합니다.

```sh
python3 -B taste.py harvest        # 대화에서 피드백 수집
python3 -B taste.py open --harvest # 수집 후 대시보드 열기
```

- 수집 대상은 로컬에 저장된 Claude Code와 Codex 대화 기록입니다. 해당 프로그램을 실행하지는 않습니다.
- 대화 수집은 직접 요청할 때만 실행하며, 에이전트 훅은 자동 설치하지 않습니다.
- 피드백의 분류가 맞지 않으면 대시보드에서 수정할 수 있습니다.

### 사용 전후 비교하기

사용 시작일 전후의 대화 기록을 다시 읽고, 화면에 대한 지적이 얼마나 나왔는지 비교합니다.

```sh
python3 -B taste.py effect --since YYYY-MM-DD
python3 -B taste.py effect --since YYYY-MM-DD:시작 --change YYYY-MM-DD:변경
```

- `--since`: Tastepin 사용 시작일. 날짜 뒤에 `:이름`을 붙일 수 있습니다.
- `--change`: 사용 방식을 바꾼 날짜와 이름. 여러 번 지정할 수 있습니다.
- 지적 빈도를 비교하는 기능이며, 결과만으로 디자인 품질이 좋아졌다고 판단할 수는 없습니다.

## 기록 저장 위치

기본 저장 위치는 Tastepin 저장소 안입니다. 아래 파일은 `.gitignore`로 제외합니다.

```text
state/          # 선택, 피드백 원문 일부, 세션 식별자, 작업 경로와 실행 기록
data/rules.json # 개인 취향 규칙
TASTE.md        # 규칙과 근거 인용으로 생성한 문서
```

### 다른 폴더에 저장하기

`TASTEPIN_DATA`에 사용할 폴더의 절대 경로를 지정합니다. 폴더는 미리 만들어 두어야 합니다.

```sh
export TASTEPIN_DATA="/absolute/path/to/tastepin-data"
python3 -B taste.py status
```

- 지정한 폴더 안에 위와 같은 구조로 저장합니다. 안내되는 명령도 같은 기록 폴더를 사용합니다.
- 같은 포트를 다른 기록 폴더의 서버가 사용 중이면 실행을 멈춥니다.
- 기록 폴더를 지정하는 실행 파일을 따로 만들었다면 `TASTEPIN_ENTRY`에 그 파일의 경로를 지정합니다. 이후 안내 명령은 해당 파일을 사용합니다.

기록 폴더와 규칙에 문제가 있는지 확인하려면 다음을 실행합니다.

```sh
python3 -B taste.py doctor
```

### 기본 사전과 외부 글꼴

- `data/symptoms.json`은 피드백을 진단과 수정 제안에 연결하는 사전입니다. 개인 취향과 별개이며, 기록 폴더를 바꿔도 Tastepin 저장소의 파일을 사용합니다.
- Lab은 Google Fonts와 jsDelivr에서 비교용 글꼴을 불러옵니다. 대화와 선택 기록은 전송하지 않습니다.

## 브라우저 검사

```sh
python3 -B taste.py lint http://localhost:3000
```

- 라이트, 다크, 휴대폰 화면에서 선택한 취향과 기본 오류를 검사합니다.
- 아직 고르지 않은 취향은 임의의 값으로 판정하지 않습니다.
- JavaScript로 실행되는 움직임의 실제 길이와 연속성, 캔버스와 이미지 속 글자는 측정하지 못합니다. 결과 끝의 수동 확인 항목도 함께 확인하세요.

## 개발과 검증

```sh
python3 -B -m unittest discover -s tests -v
cd lab
pnpm build
```

- Python 테스트는 임시 기록과 비교 시안 목록을 사용합니다.

Lab 개발 서버를 직접 실행하려면 기록 서버를 먼저 시작합니다.

```sh
python3 -B taste.py open --no-browser
cd lab
pnpm dev
```

## 지원 환경

- macOS, Linux
- Windows는 파일 잠금과 프로세스 종료를 아직 지원하지 않습니다.

## 라이선스

[MIT](LICENSE). React, Motion, Lucide 등 의존성과 외부 글꼴은 각 프로젝트의 라이선스를 따릅니다.

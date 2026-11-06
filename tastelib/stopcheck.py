"""브라우저 검사를 강제하던 훅의 호환 진입점.

2026-11-06부터 취향 적용의 기본 검증은 코드 검토다. 다른 머신이나 이미 실행 중인
세션에 옛 훅 설정이 남아 있어도 기록을 만들거나 종료를 막지 않는다.
"""


def track_codex(payload):
    """이전 PostToolUse 호출을 받아들이되 턴 기록을 만들지 않는다."""
    return None


def check(payload, surface="claude"):
    """이전 Stop 호출을 받아들이되 화면 검사를 요구하지 않는다."""
    return None

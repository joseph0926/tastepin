# /// script
# requires-python = ">=3.10"
# dependencies = ["playwright==1.64.1"]
# ///
"""`taste.py lint`의 실행 진입점. playwright가 필요해 uv가 격리 환경에서 이 파일을 실행한다."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tastelib import lint  # noqa: E402

if __name__ == "__main__":
    sys.exit(lint.main())

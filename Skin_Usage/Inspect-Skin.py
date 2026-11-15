"""Compact, offline Skin metadata and on-demand recovery. Starts no client."""
from pathlib import Path
import sys

sys.dont_write_bytecode = True
if sys.version_info < (3, 10):
    raise SystemExit('Python 3.10+ is required / 需要 Python 3.10 或更新版本')
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'scripts'))
from usage_support import main

if __name__ == '__main__':
    raise SystemExit(main(root=ROOT))

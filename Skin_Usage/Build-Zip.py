"""Package only reviewed public files; do not publish local runtime state."""
from pathlib import Path
import sys
sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'runtime/scripts'))
from release_package import PackageError, main

if __name__ == '__main__':
    try:
        raise SystemExit(main(root=ROOT))
    except (PackageError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

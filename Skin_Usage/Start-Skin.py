"""Additional Python entrypoint. The original .cmd/.ps1 launchers remain available."""
from pathlib import Path
import subprocess
import sys

if sys.version_info < (3, 10):
    raise SystemExit('Python 3.10+ is required / 需要 Python 3.10 或更新版本')

RUNTIME = Path(__file__).resolve().parent / 'runtime'
if not (RUNTIME / 'scripts/python_launcher.py').is_file():
    raise SystemExit('The bundled runtime is missing / 使用包内缺少运行文件')
sys.path.insert(0, str(RUNTIME / 'scripts'))
from python_launcher import main
from python_host import HostError

if __name__ == '__main__':
    try:
        raise SystemExit(main(root=RUNTIME))
    except (HostError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print('Python launch failed / Python 启动未完成: ' + str(error), file=sys.stderr)
        raise SystemExit(1)

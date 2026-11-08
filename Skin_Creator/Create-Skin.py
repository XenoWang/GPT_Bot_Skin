"""Additional Python entrypoint; never invokes the legacy PowerShell backend."""
import json
from pathlib import Path
import subprocess
import sys
sys.dont_write_bytecode = True

if sys.version_info < (3, 10):
    raise SystemExit('Python 3.10+ is required / 需要 Python 3.10 或更新版本')

CREATOR = Path(__file__).resolve().parent
RUNTIME = CREATOR / 'runtime'
if not (RUNTIME / 'scripts/python_launcher.py').is_file():
    raise SystemExit('The bundled Creator runtime is missing / 创作包内缺少运行文件')
sys.path.insert(0, str(RUNTIME / 'scripts'))
from python_launcher import child_environment, node_executable, system_language
from python_host import HostError


def messages():
    base = json.loads((CREATOR / 'locales/en.json').read_text(encoding='utf-8'))['messages']
    preferred = system_language()
    files = list((CREATOR / 'locales').glob('*.json'))
    chosen = next((p for p in files if p.stem.casefold() == preferred.casefold()), None)
    if chosen is None:
        chosen = next((p for p in files if p.stem.split('-')[0].casefold() == preferred.split('-')[0].casefold()), None)
    if chosen:
        base.update(json.loads(chosen.read_text(encoding='utf-8')).get('messages', {}))
    return base


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    labels = messages()
    if not argv or argv in (['--help'], ['-h']):
        print(labels['python.help'])
        return 0
    node = node_executable()
    # A list preserves spaces, quotes and non-ASCII paths without shell interpretation.
    process = subprocess.run([node, str(CREATOR / 'scripts/creator.mjs'), *argv], env=child_environment(), cwd=Path.cwd(), creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    return process.returncode


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (HostError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        try:
            template = messages()['python.error']
        except Exception:
            template = 'Python creator failed: {detail}'
        print(template.replace('{detail}', str(error)), file=sys.stderr)
        raise SystemExit(1)

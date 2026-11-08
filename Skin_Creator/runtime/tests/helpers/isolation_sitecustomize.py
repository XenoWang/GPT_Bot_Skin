"""Test-only accidental-dependency guard, not a security sandbox for malicious code.

Copied as sitecustomize.py into a temporary guard directory. Every Python child
inherits it; Node children inherit their own filesystem permission flags.
"""
import json
import os
import re
import shlex
import sys

_PROBES = 0


def _normal(value):
    result = os.path.normcase(os.path.realpath(os.path.abspath(os.fsdecode(value))))
    if os.name == 'nt':
        if result.startswith('\\\\?\\unc\\'):
            result = '\\\\' + result[8:]
        elif result.startswith('\\\\?\\'):
            result = result[4:]
    return result


def _within(path, root):
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        return False


try:
    _REPOSITORY = _normal(os.environ['SKIN_ISOLATION_REPOSITORY'])
    _ALLOWED = tuple(_normal(p) for p in json.loads(os.environ['SKIN_ISOLATION_ALLOWED']))
    _EXECUTABLES = {_normal(p) for p in json.loads(os.environ['SKIN_ISOLATION_EXECUTABLES'])}

    def _check(value, event):
        if not isinstance(value, (str, bytes, os.PathLike)):
            return
        resolved = _normal(value)
        if _within(resolved, _REPOSITORY) and not any(_within(resolved, p) for p in _ALLOWED):
            raise PermissionError('SKIN_TEST_ISOLATION_BLOCKED: ' + event + ': ' + resolved)

    def _audit(event, args):
        global _PROBES
        if event == 'skin.isolation.probe':
            _PROBES += 1
        elif event in ('open', 'os.listdir', 'os.scandir', 'os.chdir', 'cpython.run_file') and args:
            _check(args[0], event)
        elif event == 'import' and len(args) > 1 and args[1]:
            _check(args[1], event)
        elif event == 'subprocess.Popen':
            executable, arguments, cwd, environment = args
            vector = arguments
            if isinstance(arguments, str):
                vector = [item[1:-1] if item.startswith('"') and item.endswith('"') else item for item in shlex.split(arguments, posix=False)]
            if executable is None:
                if isinstance(vector, (list, tuple)) and vector:
                    executable = vector[0]
                elif isinstance(arguments, str):
                    first = re.match(r'^\s*(?:"([^"]+)"|(\S+))', arguments)
                    executable = (first[1] or first[2]) if first else ''
            if _normal(executable) not in _EXECUTABLES:
                raise PermissionError('SKIN_TEST_ISOLATION_BLOCKED: unexpected subprocess')
            if cwd is not None:
                _check(cwd, event)
            if isinstance(vector, (list, tuple)):
                for item in vector[1:]:
                    if isinstance(item, str) and os.path.isabs(item):
                        _check(item, event)
            if environment is not None:
                for key in ('PYTHONPATH', 'SKIN_ISOLATION_REPOSITORY', 'SKIN_ISOLATION_ALLOWED', 'SKIN_ISOLATION_EXECUTABLES', 'NODE_OPTIONS'):
                    if environment.get(key) != os.environ.get(key):
                        raise PermissionError('SKIN_TEST_ISOLATION_BLOCKED: child guard was not inherited')

    sys.addaudithook(_audit)

    def assert_active():
        before = _PROBES
        sys.audit('skin.isolation.probe')
        if _PROBES != before + 1:
            raise RuntimeError('Isolation audit guard was not installed')

    assert_active()
    ACTIVE_PID = os.getpid()
except BaseException as error:
    # sitecustomize import errors normally do not stop Python. Fail closed instead.
    sys.stderr.write('SKIN_TEST_GUARD_STARTUP_FAILED: ' + str(error) + '\n')
    os._exit(91)

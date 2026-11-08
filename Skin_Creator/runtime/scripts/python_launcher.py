"""Additive Python launch/configuration/restore chain. Existing PS/CMD entrypoints stay intact."""
import argparse
import ctypes as C
from ctypes import wintypes as W
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
from urllib.parse import urlsplit
import uuid
from python_host import HostError, WindowsHost, assert_owner, filetime_text, read_json, reject_links

ROOT = Path(__file__).resolve().parents[1]


def runtime_role(root):
    profile = Path(root) / 'runtime-profile.json'
    if not profile.exists():
        return 'usage'
    value = read_json(profile)
    if set(value) != {'schemaVersion', 'role'} or type(value['schemaVersion']) is not int or value['schemaVersion'] != 1 or value['role'] not in ('creator', 'usage'):
        raise HostError('Invalid runtime profile')
    return value['role']


def atomic_bytes(path, data):
    path = reject_links(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    old = path.read_bytes() if path.exists() else None
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temporary.open('xb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if (path.read_bytes() if path.exists() else None) != old:
            raise HostError('Configuration changed concurrently; no overwrite performed')
        os.replace(temporary, path)
        if path.read_bytes() != data:
            raise HostError('Saved data did not match its readback')
    finally:
        if temporary.exists():
            temporary.unlink()


def save_json(path, value):
    atomic_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def launch_config(root, *, mode=None, proxy=None, port=None, state_root=None):
    root = Path(root).resolve()
    role = runtime_role(root)
    python_file, legacy = root / 'launcher-python.json', root / 'launcher.json'
    source = python_file if python_file.exists() else legacy
    data = read_json(source) if source.exists() else {}
    if set(data) - {'port', 'proxyMode', 'proxyServer', 'stateRoot'}:
        raise HostError('Unknown launch configuration field')
    selected_mode = mode if mode is not None else data.get('proxyMode')
    selected_port = port if port is not None else data.get('port', 9335)
    selected_proxy = proxy if proxy is not None else data.get('proxyServer', '')
    if selected_mode not in ('proxy', 'direct'):
        raise HostError('Choose proxy or direct first: Start-Skin.py configure --proxy-mode direct|proxy')
    if type(selected_port) is not int or not 1024 <= selected_port <= 65535:
        raise HostError('CDP port must be an integer between 1024 and 65535')
    if selected_mode == 'proxy':
        match = re.fullmatch(r'127\.0\.0\.1:(\d{1,5})', selected_proxy) if isinstance(selected_proxy, str) else None
        if not match or not 1 <= int(match[1]) <= 65535:
            raise HostError('Expected a local HTTP proxy: 127.0.0.1:port')
    else:
        selected_proxy = ''
    # Legacy preferences may be read, but legacy runtime state is never adopted or overwritten.
    selected_state = state_root if state_root is not None else data.get('stateRoot') if source == python_file else None
    if not selected_state:
        local = os.environ.get('LOCALAPPDATA')
        if not local:
            raise HostError('LOCALAPPDATA is unavailable; specify --state-root explicitly')
        selected_state = str(Path(local) / ('CodexSkinCreatorPython' if role == 'creator' else 'CodexSkinPython'))
    if not isinstance(selected_state, str):
        raise HostError('State directory must be a path string')
    state = Path(selected_state)
    if not state.is_absolute():
        state = root / state
    state = reject_links(state)
    legacy_data = read_json(legacy) if legacy.exists() else {}
    legacy_state = legacy_data.get('stateRoot') or str(Path(os.environ.get('LOCALAPPDATA', root)) / ('CodexSkinCreator' if role == 'creator' else 'CodexSkin'))
    if not isinstance(legacy_state, str):
        raise HostError('Legacy state directory is invalid; do not overwrite it')
    legacy_path = Path(legacy_state)
    if not legacy_path.is_absolute():
        legacy_path = root / legacy_path
    if os.path.normcase(str(state)) == os.path.normcase(os.path.abspath(legacy_path)):
        raise HostError('Python and legacy routes must use separate state directories')
    return {'port': selected_port, 'proxyMode': selected_mode, 'proxyServer': selected_proxy, 'stateRoot': str(state)}


def client_arguments(config):
    values = ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + str(config['port'])]
    if config['proxyMode'] == 'proxy':
        values += ['--proxy-server=http://' + config['proxyServer'], '--proxy-bypass-list=localhost;127.0.0.1;[::1]']
    elif config['proxyMode'] == 'direct':
        values += ['--no-proxy-server']
    else:
        raise HostError('Invalid proxy mode')
    return values


def child_environment(config=None):
    env = dict(os.environ)
    env.update(CODEX_SKIN_HOST_BACKEND='python', CODEX_SKIN_PYTHON=str(Path(sys.executable).resolve()), NO_PROXY='127.0.0.1,localhost,::1', PYTHONUTF8='1', PYTHONDONTWRITEBYTECODE='1')
    if config:
        for key in list(env):
            if key.upper() in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'):
                env.pop(key)
        env['NO_PROXY'] = '127.0.0.1,localhost,::1'
        if config['proxyMode'] == 'proxy':
            for key in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'):
                env[key] = 'http://' + config['proxyServer']
    return env


def node_executable(value=None):
    found = str(Path(value).resolve()) if value else shutil.which('node')
    if not found or not Path(found).is_file() or Path(found).suffix.lower() != '.exe':
        raise HostError('Node.js 22+ is required; no dependencies are installed automatically')
    result = subprocess.run([found, '-p', 'process.versions.node'], capture_output=True, text=True, timeout=15, check=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-+].*)?', result.stdout.strip()) or int(result.stdout.split('.')[0]) < 22:
        raise HostError('Node.js 22+ is required')
    return str(Path(found).resolve())


def browser_identity(port, browser_id=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    try:
        connection.request('GET', '/json/version')
        response = connection.getresponse()
        data = response.read(1024 * 1024 + 1)
        if response.status != 200 or len(data) > 1024 * 1024:
            raise HostError('Invalid local CDP discovery response')
        url = json.loads(data)['webSocketDebuggerUrl']
    finally:
        connection.close()
    return validate_browser_url(url, port, browser_id)


def validate_browser_url(url, port, browser_id=None):
    parsed = urlsplit(url)
    match = re.fullmatch(r'/devtools/browser/([A-Za-z0-9._-]{1,200})', parsed.path)
    if parsed.scheme != 'ws' or parsed.hostname != '127.0.0.1' or parsed.port != port or parsed.username or parsed.password or parsed.query or parsed.fragment or not match or browser_id is not None and match[1] != browser_id:
        raise HostError('Local CDP browser identity mismatch')
    return {'browserId': match[1], 'browserUrl': url}


def companion_record(root, config, node, host):
    file = Path(config['stateRoot']) / 'python-companion.json'
    if not file.exists():
        return None
    record = read_json(file)
    expected = str((Path(root) / 'scripts/cdp-companion.mjs').resolve())
    if record.get('helper') != expected or os.path.normcase(record.get('exe', '')) != os.path.normcase(node):
        raise HostError('Python companion record belongs to another runtime')
    try:
        actual = host.process(record['pid'])
    except ProcessLookupError:
        return None
    if actual['startedTicks'] != record.get('startedTicks') or os.path.normcase(actual['exe']) != os.path.normcase(node):
        raise HostError('Python companion process identity changed')
    return actual


def start_companion(root, config, node, host):
    if companion_record(root, config, node, host):
        return 'already-running'
    state_root = reject_links(config['stateRoot'])
    stop = reject_links(state_root / 'stop')
    if stop.exists():
        stop.unlink()
    helper = (Path(root) / 'scripts/cdp-companion.mjs').resolve()
    with reject_links(state_root / 'companion.log').open('ab') as output, reject_links(state_root / 'companion-error.log').open('ab') as errors:
        process = subprocess.Popen([node, str(helper), 'watch', str(state_root / 'session.json')], cwd=root, env=child_environment(), stdin=subprocess.DEVNULL, stdout=output, stderr=errors, close_fds=True, creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP)
    try:
        record = host.process(process.pid)
        if os.path.normcase(record['exe']) != os.path.normcase(node):
            raise HostError('Unexpected companion executable')
        record['helper'] = str(helper)
        save_json(state_root / 'python-companion.json', record)
    except Exception:
        atomic_bytes(stop, b'stop')
        raise
    return 'started'


def start(root, config, node, host, *, wait_for_exit=False, package_family=None):
    root, state_root = Path(root), reject_links(config['stateRoot'])
    for name in ('cdp-payload.js', 'cdp-payload.json'):
        if not (root / 'dist' / name).is_file():
            raise HostError('Build the runtime payload before launching')
    if config['proxyMode'] == 'proxy':
        with socket.create_connection(('127.0.0.1', int(config['proxyServer'].split(':')[1])), timeout=3):
            pass
    with host.launch_lock():
        state_root.mkdir(parents=True, exist_ok=True)
        package = host.package(family=package_family)
        state_path = state_root / 'session.json'
        if state_path.exists() and read_json(state_path).get('backend') != 'python':
            raise HostError('This state directory belongs to another launch route; it will not be overwritten')
        current = host.processes(package['exe'])
        if current and state_path.exists():
            state = read_json(state_path)
            if state.get('port') == config['port'] and state.get('proxyMode') == config['proxyMode'] and state.get('proxy') == config['proxyServer']:
                assert_owner(state, host)
                browser_identity(config['port'], state['browserId'])
                return {'state': 'reused-not-visually-verified', 'companion': start_companion(root, config, node, host), 'session': str(state_path)}
        if current:
            if not wait_for_exit:
                raise HostError('Codex is already running. Save input and exit normally, then retry; --wait-for-exit waits without force-closing it')
            print('Waiting for normal client exit / 等待你正常退出客户端，不会强制关闭', file=sys.stderr)
            deadline = time.monotonic() + 600
            while host.processes(package['exe']):
                if time.monotonic() >= deadline:
                    raise HostError('Timed out waiting for normal client exit')
                time.sleep(.5)
            package = host.package(family=package_family)
        if host.listeners(config['port']):
            raise HostError('Requested port is occupied; existing sessions are not taken over')
        subprocess.Popen([package['exe'], *client_arguments(config)], env=child_environment(config), close_fds=True)
        deadline, listeners = time.monotonic() + 45, []
        while time.monotonic() < deadline:
            listeners = host.listeners(config['port'])
            if listeners:
                break
            time.sleep(.4)
        if not listeners or any(p['address'] != '127.0.0.1' for p in listeners) or len({p['pid'] for p in listeners}) != 1:
            raise HostError('Official client did not expose one verified IPv4 loopback listener; no patch or security change attempted')
        process = host.process(listeners[0]['pid'], include_package=True)
        state = {'backend': 'python', 'port': config['port'], 'proxy': config['proxyServer'], 'proxyMode': config['proxyMode'], 'exe': package['exe'], 'packageFullName': package['packageFullName'], 'ownerPid': process['pid'], 'ownerStartedTicks': process['startedTicks'], 'ownerStarted': filetime_text(process['startedTicks'])}
        assert_owner(state, host)
        state.update(browser_identity(config['port']))
        assert_owner(state, host)
        save_json(state_path, state)
        return {'state': 'started-not-visually-verified', 'companion': start_companion(root, config, node, host), 'session': str(state_path)}


def restore(root, config, node, host):
    with host.launch_lock():
        state_root = reject_links(config['stateRoot'])
        state = read_json(state_root / 'session.json')
        assert_owner(state, host)
        browser_identity(state['port'], state['browserId'])
        watcher = companion_record(root, config, node, host)
        atomic_bytes(state_root / 'stop', b'stop')
        if watcher:
            host.wait_for_exit(watcher, 30)
        subprocess.run([node, str(Path(root) / 'scripts/cdp-companion.mjs'), 'remove', str(state_root / 'session.json')], env=child_environment(), check=True, creationflags=subprocess.CREATE_NO_WINDOW)
        return {'state': 'layers-removed', 'note': 'Exit Codex normally to close the CDP listener / 正常退出客户端后才会关闭调试端口'}


def system_language():
    if os.name != 'nt':
        return 'en'
    kernel = C.WinDLL('kernel32', winmode=0x800)
    get = WindowsHost.fn(kernel, 'GetUserDefaultUILanguage', [], W.WORD)
    convert = WindowsHost.fn(kernel, 'LCIDToLocaleName', [W.DWORD, W.LPWSTR, C.c_int, W.DWORD], C.c_int)
    text = C.create_unicode_buffer(85)
    if not convert(get(), text, len(text), 0):
        raise HostError('Windows UI language query failed')
    return text.value


def main(argv=None, root=ROOT):
    parser = argparse.ArgumentParser(description='Additional Python Skin launcher / 附加 Python 启动链路（保留原入口）')
    parser.add_argument('action', nargs='?', default='start', choices=['start', 'configure', 'restore', 'doctor', 'assert-owner', 'locale'])
    parser.add_argument('--proxy-mode', choices=['proxy', 'direct'])
    parser.add_argument('--proxy-server')
    parser.add_argument('--port', type=int)
    parser.add_argument('--state-root')
    parser.add_argument('--state')
    parser.add_argument('--node')
    parser.add_argument('--package-family')
    parser.add_argument('--wait-for-exit', action='store_true')
    args = parser.parse_args(argv)
    if args.action == 'locale':
        print(system_language())
        return 0
    if args.action == 'assert-owner':
        if not args.state:
            raise HostError('--state is required')
        assert_owner(read_json(args.state), WindowsHost())
        print('Official loopback CDP owner confirmed (Python)')
        return 0
    config = launch_config(root, mode=args.proxy_mode, proxy=args.proxy_server, port=args.port, state_root=args.state_root)
    if args.action == 'configure':
        if not args.proxy_mode:
            raise HostError('Configure requires an explicit --proxy-mode proxy|direct')
        file = Path(root) / 'launcher-python.json'
        if file.exists():
            atomic_bytes(file.with_name(file.name + '.previous'), read_json_bytes(file))
        save_json(file, config)
        result = {'configured': str(file), 'stateRoot': config['stateRoot'], 'legacyConfigurationChanged': False}
    else:
        node, host = node_executable(args.node), WindowsHost()
        if args.action == 'doctor':
            package = host.package(family=args.package_family)
            result = {'python': sys.version.split()[0], 'node': node, 'package': package['packageFullName'], 'stateRoot': config['stateRoot'], 'powerShellRequired': False, 'clientStarted': False}
        elif args.action == 'restore':
            result = restore(root, config, node, host)
        else:
            result = start(root, config, node, host, wait_for_exit=args.wait_for_exit, package_family=args.package_family)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def read_json_bytes(file):
    read_json(file)
    return Path(file).read_bytes()


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (HostError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print('Python launch failed / Python 启动未完成: ' + str(error), file=sys.stderr)
        raise SystemExit(1)

"""Additive Python chain: synthetic state, no real client startup or personal configuration."""
from contextlib import nullcontext, redirect_stdout, redirect_stderr
import copy
import ctypes as C
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zlib

from test_creator import two_color_png

ENGINE = Path(__file__).resolve().parents[1]
REPO = ENGINE.parent.parent
sys.path.insert(0, str(ENGINE / 'scripts'))
import python_launcher as launcher
from python_host import WindowsHost, HostError, assert_owner, filetime_text, reject_links

FULL = 'OpenAI.Codex_1.2.3.4_x64__abc123abc123a'


class FakeHost:
    def __init__(self):
        self.package_info = {'packageFullName': FULL, 'exe': r'C:\Fixture\ChatGPT.exe', 'version': (1, 2, 3, 4), 'origin': 'store', 'development': False}
        self.process_info = {'pid': 456, 'exe': r'C:\Fixture\ChatGPT.exe', 'packageFullName': FULL, 'startedTicks': '116444736000000000'}
        self.tcp = [{'address': '127.0.0.1', 'pid': 456}]
        self.running = []

    def package(self, **unused):
        return self.package_info

    def process(self, pid, include_package=False):
        return self.process_info

    def processes(self, executable):
        return self.running

    def listeners(self, port):
        return self.tcp

    def launch_lock(self):
        return nullcontext()


def session():
    return {'backend': 'python', 'port': 9335, 'proxyMode': 'direct', 'proxy': '', 'exe': r'C:\Fixture\ChatGPT.exe', 'packageFullName': FULL, 'ownerPid': 456, 'ownerStartedTicks': '116444736000000000', 'browserId': 'fixture-browser', 'browserUrl': 'ws://127.0.0.1:9335/devtools/browser/fixture-browser'}


def png_pixels(data):
    # Independent PNG decoder for the small RGB/RGBA fixture output. No GDI dependency.
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not PNG')
    position, compressed = 8, bytearray()
    while position < len(data):
        size = struct.unpack('>I', data[position:position + 4])[0]
        kind, content = data[position + 4:position + 8], data[position + 8:position + 8 + size]
        if zlib.crc32(kind + content) & 0xffffffff != struct.unpack('>I', data[position + 8 + size:position + 12 + size])[0]:
            raise ValueError('PNG CRC mismatch')
        if kind == b'IHDR':
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', content)
            if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
                raise ValueError('Unexpected fixture encoding')
        if kind == b'IDAT':
            compressed.extend(content)
        position += size + 12
    channels = 3 if color == 2 else 4
    stride, raw = width * channels, zlib.decompress(compressed)
    if len(raw) != height * (stride + 1):
        raise ValueError('PNG row length mismatch')
    previous, rows = bytearray(stride), []
    for y in range(height):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        for i in range(stride):
            left, above, diagonal = row[i - channels] if i >= channels else 0, previous[i], previous[i - channels] if i >= channels else 0
            if method == 0:
                predictor = 0
            elif method == 1:
                predictor = left
            elif method == 2:
                predictor = above
            elif method == 3:
                predictor = (left + above) // 2
            elif method == 4:
                p = left + above - diagonal
                distances = [abs(p - left), abs(p - above), abs(p - diagonal)]
                predictor = (left, above, diagonal)[distances.index(min(distances))]
            else:
                raise ValueError('Invalid PNG filter')
            row[i] = (row[i] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, channels, rows


def oriented_tiff():
    # Uncompressed baseline TIFF, RGB, 32x16, EXIF orientation 6 = 90 degrees clockwise.
    count = 11
    bits_offset = 8 + 2 + count * 12 + 4
    pixels_offset = bits_offset + 6
    tags = [(256, 4, 1, 32), (257, 4, 1, 16), (258, 3, 3, bits_offset),
            (259, 3, 1, 1), (262, 3, 1, 2), (273, 4, 1, pixels_offset),
            (274, 3, 1, 6), (277, 3, 1, 3), (278, 4, 1, 16),
            (279, 4, 1, 32 * 16 * 3), (284, 3, 1, 1)]
    entries = b''.join(struct.pack('<HHII', *tag) for tag in tags)
    row = b'\xff\x00\x00' * 16 + b'\x00\x00\xff' * 16
    return b'II' + struct.pack('<HIH', 42, 8, count) + entries + struct.pack('<IHHH', 0, 8, 8, 8) + row * 16


class PythonLaunchers(unittest.TestCase):
    def setUp(self):
        work = ENGINE / 'work' / 'python-launcher-tests'
        work.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='python-', dir=work)
        self.folder = Path(self.temporary.name).resolve()
        if not self.folder.is_relative_to(work.resolve()):
            raise RuntimeError('Test output outside the approved area')

    def tearDown(self):
        self.temporary.cleanup()

    def test_legacy_entrypoints_and_themes_match_pre_change_snapshot(self):
        frozen = json.loads((ENGINE / 'tests/fixtures/python-legacy-files.json').read_text(encoding='utf-8'))
        self.assertEqual(len(frozen['files']), 44)  # Public legacy PS/CMD and theme files, excluding two private configs.
        for name, expected in frozen['files'].items():
            relative = Path(name)
            self.assertFalse(relative.is_absolute())
            self.assertNotIn('..', relative.parts)
            self.assertEqual(hashlib.sha256((REPO / relative).read_bytes()).hexdigest(), expected, name)

    def test_configuration_is_separate_and_invalid_parameters_are_rejected(self):
        legacy = self.folder / 'launcher.json'
        original = b'{"port":9335,"proxyMode":"proxy","proxyServer":"127.0.0.1:7897","stateRoot":"legacy"}'
        legacy.write_bytes(original)
        with patch.dict(os.environ, {'LOCALAPPDATA': str(self.folder)}, clear=False):
            config = launcher.launch_config(self.folder)
            self.assertEqual(config, {'port': 9335, 'proxyMode': 'proxy', 'proxyServer': '127.0.0.1:7897', 'stateRoot': str(self.folder / 'CodexSkinPython')})
            for port in [0, 1023, 65536, True]:
                with self.assertRaises(HostError):
                    launcher.launch_config(self.folder, port=port)
            for proxy in ['remote.example:80', '127.0.0.1:0', '127.0.0.1:65536', 8080]:
                with self.assertRaises(HostError):
                    launcher.launch_config(self.folder, proxy=proxy)
            with self.assertRaisesRegex(HostError, 'separate state'):
                launcher.launch_config(self.folder, state_root=str(self.folder / 'alias' / '..' / 'legacy'))
            with patch.object(launcher, 'WindowsHost', side_effect=AssertionError('Configure must not inspect a live client')), redirect_stdout(io.StringIO()):
                launcher.main(['configure', '--proxy-mode', 'direct'], root=self.folder)
            saved = json.loads((self.folder / 'launcher-python.json').read_text(encoding='utf-8'))
            self.assertEqual(saved['proxyMode'], 'direct')
            self.assertEqual(saved['proxyServer'], '')
        self.assertEqual(legacy.read_bytes(), original)
        self.assertFalse((self.folder / 'legacy').exists())

    def test_child_environment_and_argument_vectors_do_not_change_parent_configuration(self):
        direct = {'port': 9335, 'proxyMode': 'direct', 'proxyServer': ''}
        proxy = {'port': 9444, 'proxyMode': 'proxy', 'proxyServer': '127.0.0.1:7897'}
        self.assertEqual(launcher.client_arguments(direct), ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9335', '--no-proxy-server'])
        self.assertEqual(launcher.client_arguments(proxy), ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9444', '--proxy-server=http://127.0.0.1:7897', '--proxy-bypass-list=localhost;127.0.0.1;[::1]'])
        with patch.dict(os.environ, {'http_proxy': 'fixture-parent', 'HTTPS_PROXY': 'fixture-parent'}, clear=True):
            before = dict(os.environ)
            env = launcher.child_environment(direct)
            self.assertNotIn('http_proxy', env)
            self.assertNotIn('HTTPS_PROXY', env)
            self.assertEqual(env['CODEX_SKIN_HOST_BACKEND'], 'python')
            self.assertEqual(env['CODEX_SKIN_PYTHON'], str(Path(sys.executable).resolve()))
            self.assertEqual(launcher.child_environment(proxy)['HTTP_PROXY'], 'http://127.0.0.1:7897')
            self.assertEqual(dict(os.environ), before)

    def test_owner_checks_reject_origin_development_path_port_pid_and_start_time_mismatch(self):
        self.assertEqual(assert_owner(session(), FakeHost())['packageFullName'], FULL)
        variants = [lambda h: h.package_info.update(origin='sideload'), lambda h: h.package_info.update(development=True),
                    lambda h: h.package_info.update(exe=r'C:\Other\ChatGPT.exe'), lambda h: h.tcp.clear(),
                    lambda h: h.tcp[0].update(address='0.0.0.0'), lambda h: h.tcp[0].update(address='::1'),
                    lambda h: h.tcp[0].update(pid=123), lambda h: h.process_info.update(startedTicks='different'),
                    lambda h: h.process_info.update(packageFullName='other'), lambda h: h.process_info.update(exe=r'C:\Other\ChatGPT.exe')]
        for change in variants:
            host = FakeHost()
            change(host)
            with self.assertRaises(HostError):
                assert_owner(session(), host)
        legacy = session()
        del legacy['ownerStartedTicks']
        with self.assertRaisesRegex(HostError, 'timestamp'):
            assert_owner(legacy, FakeHost())

    def test_package_query_filters_store_origin_and_development_flags(self):
        folder = self.folder / 'package'
        (folder / 'app').mkdir(parents=True)
        (folder / 'app/ChatGPT.exe').write_bytes(b'non-executable fixture')
        state = {'origin': 3, 'properties': 0}
        def find(family, flags, count, names, length, buffer, properties):
            self.assertEqual(flags, 0x10)
            count._obj.value = 1
            length._obj.value = len(FULL) + 1
            if names is None:
                return 122
            names[0] = FULL
            properties[0] = state['properties']
            return 0
        def origin(full, output):
            output._obj.value = state['origin']
            return 0
        def package_path(full, length, buffer):
            length._obj.value = len(str(folder)) + 1
            if buffer is None:
                return 122
            buffer.value = str(folder)
            return 0
        host = WindowsHost.__new__(WindowsHost)
        host.kernel = types.SimpleNamespace(FindPackagesByPackageFamily=find, GetPackagePathByFullName=package_path)
        host.base = types.SimpleNamespace(GetStagedPackageOrigin=origin)
        self.assertEqual(host.packages('OpenAI.Codex_abc123abc123a')[0]['exe'], str(folder / 'app/ChatGPT.exe'))
        for value in [0, 1, 2, 4, 5, 6]:
            state['origin'] = value
            self.assertEqual(host.packages('OpenAI.Codex_abc123abc123a'), [])
        state.update(origin=3, properties=0x10000)
        self.assertEqual(host.packages('OpenAI.Codex_abc123abc123a'), [])

    def test_browser_identity_and_runtime_paths_are_strict(self):
        valid = 'ws://127.0.0.1:9335/devtools/browser/fixture'
        self.assertEqual(launcher.validate_browser_url(valid, 9335, 'fixture')['browserId'], 'fixture')
        for bad in ['ws://localhost:9335/devtools/browser/fixture', 'ws://127.0.0.1:9444/devtools/browser/fixture', valid + '?token=x', valid + '#fragment', 'ws://user@127.0.0.1:9335/devtools/browser/fixture', 'ws://127.0.0.1:9335/devtools/page/fixture']:
            with self.assertRaises(HostError):
                launcher.validate_browser_url(bad, 9335, 'fixture')
        with self.assertRaises(HostError):
            launcher.validate_browser_url(valid, 9335, 'other')
        self.assertEqual(reject_links(self.folder / 'x' / '..' / 'state'), self.folder / 'state')
        with patch.object(Path, 'lstat', return_value=types.SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0x400)):
            with self.assertRaisesRegex(HostError, 'reparse'):
                reject_links(self.folder)
        self.assertEqual(filetime_text('116444736000000001'), '1970-01-01T00:00:00.0000001Z')

    def fixture_runtime(self):
        (self.folder / 'dist').mkdir()
        for name in ('cdp-payload.js', 'cdp-payload.json'):
            (self.folder / 'dist' / name).write_text('fixture', encoding='utf-8')
        return {'port': 9335, 'proxyMode': 'direct', 'proxyServer': '', 'stateRoot': str(self.folder / 'python-state')}

    def test_launch_builds_only_the_explicit_official_argument_vector_in_an_isolated_fixture(self):
        config, host = self.fixture_runtime(), FakeHost()
        observations = 0
        def listening(port):
            nonlocal observations
            observations += 1
            return [] if observations == 1 else host.tcp
        host.listeners = listening
        identity = {'browserId': 'fixture-browser', 'browserUrl': 'ws://127.0.0.1:9335/devtools/browser/fixture-browser'}
        with patch.object(launcher.subprocess, 'Popen') as start, patch.object(launcher, 'browser_identity', return_value=identity), patch.object(launcher, 'start_companion', return_value='fixture-companion'):
            result = launcher.start(self.folder, config, 'node.exe', host)
        start.assert_called_once()
        self.assertEqual(start.call_args.args[0], [r'C:\Fixture\ChatGPT.exe', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9335', '--no-proxy-server'])
        self.assertNotIn('shell', start.call_args.kwargs)
        self.assertEqual(result['state'], 'started-not-visually-verified')
        saved = json.loads((Path(config['stateRoot']) / 'session.json').read_text(encoding='utf-8'))
        self.assertEqual(saved['ownerStartedTicks'], '116444736000000000')
        self.assertEqual(saved['backend'], 'python')

    def test_running_clients_occupied_ports_and_foreign_sessions_are_not_taken_over(self):
        config, host = self.fixture_runtime(), FakeHost()
        host.running = [host.process_info]
        with patch.object(launcher.subprocess, 'Popen') as start, patch.object(launcher, 'browser_identity') as discover:
            with self.assertRaisesRegex(HostError, 'already running'):
                launcher.start(self.folder, config, 'node.exe', host)
            host.running = []
            with self.assertRaisesRegex(HostError, 'occupied'):
                launcher.start(self.folder, config, 'node.exe', host)
            state = Path(config['stateRoot']) / 'session.json'
            original = b'{"backend":"legacy"}'
            state.write_bytes(original)
            with self.assertRaisesRegex(HostError, 'another launch route'):
                launcher.start(self.folder, config, 'node.exe', host)
            self.assertEqual(state.read_bytes(), original)
        start.assert_not_called()
        discover.assert_not_called()

    def test_current_process_and_isolated_loopback_listener_native_abi(self):
        # Only our test interpreter and a temporary local socket; no Codex or accounts.
        host = WindowsHost()
        first, second = host.process(os.getpid()), host.process(os.getpid())
        self.assertEqual(first['pid'], os.getpid())
        self.assertEqual(first['startedTicks'], second['startedTicks'])
        self.assertEqual(Path(first['exe']).resolve(), Path(sys.executable).resolve())
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen(1)
            rows = host.listeners(listener.getsockname()[1])
            self.assertIn({'address': '127.0.0.1', 'pid': os.getpid()}, rows)

    def test_python_image_codec_preserves_pixels_orientation_and_no_overwrite(self):
        codec = REPO / 'Skin_Creator/scripts/image-codec.py'
        for name, data, crop, dimensions in [('source.png', two_color_png(), [16, 0, 16, 16], [32, 16]), ('source.tiff', oriented_tiff(), [0, 16, 16, 16], [16, 32])]:
            source, output, spec = self.folder / name, self.folder / (name + '.png'), self.folder / (name + '.json')
            source.write_bytes(data)
            spec.write_text(json.dumps({'input': str(source), 'output': str(output), 'target': [8, 8], 'crop': crop}), encoding='utf-8')
            command = [sys.executable, '-X', 'utf8', str(codec), '--spec', str(spec)]
            measured = json.loads(subprocess.run(command, capture_output=True, text=True, check=True).stdout)
            self.assertEqual([measured['width'], measured['height']], dimensions)
            width, height, channels, rows = png_pixels(output.read_bytes())
            self.assertEqual([width, height], [8, 8])
            self.assertEqual(list(rows[4][4 * channels:4 * channels + 3]), [0, 0, 255])
            self.assertEqual(source.read_bytes(), data)
            saved = output.read_bytes()
            self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(output.read_bytes(), saved)
        bad = self.folder / 'bad.json'
        bad.write_text(json.dumps({'input': str(self.folder / 'source.png'), 'output': str(self.folder / 'bad.png'), 'target': [32, 32], 'crop': [0, 0, 16, 16]}), encoding='utf-8')
        self.assertNotEqual(subprocess.run([sys.executable, '-X', 'utf8', str(codec), '--spec', str(bad)], capture_output=True).returncode, 0)
        self.assertFalse((self.folder / 'bad.png').exists())

    def test_python_entrypoint_help_and_node_dispatch_without_client_start(self):
        for entry in [REPO / 'Skin_Creator/Create-Skin.py', REPO / 'Skin_Usage/Start-Skin.py']:
            result = subprocess.run([sys.executable, '-X', 'utf8', str(entry), '--help'], capture_output=True, text=True, check=True)
            self.assertIn('Python', result.stdout)
        spec = importlib.util.spec_from_file_location('creator_python_entry_fixture', REPO / 'Skin_Creator/Create-Skin.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        args = ['asset', '--session', 'fixture directory & literal', '--input', 'image name.png']
        output, errors = io.StringIO(), io.StringIO()
        child = types.SimpleNamespace(returncode=7, stdout='fixture-output 中文\n'.encode('utf-8'), stderr=b'fixture-error\n')
        with patch.object(module, 'messages', return_value={}), patch.object(module, 'node_executable', return_value=r'C:\Node Directory\node.exe'), patch.object(module.subprocess, 'run', return_value=child) as invoke, redirect_stdout(output), redirect_stderr(errors):
            self.assertEqual(module.main(args), 7)
        self.assertEqual(output.getvalue(), 'fixture-output 中文\n')
        self.assertEqual(errors.getvalue(), 'fixture-error\n')
        self.assertEqual(invoke.call_args.args[0], [r'C:\Node Directory\node.exe', str(REPO / 'Skin_Creator/scripts/creator.mjs'), *args])
        self.assertEqual(invoke.call_args.kwargs['env']['CODEX_SKIN_HOST_BACKEND'], 'python')
        self.assertNotIn('shell', invoke.call_args.kwargs)
        self.assertEqual(invoke.call_args.kwargs['stdout'], subprocess.PIPE)
        self.assertEqual(invoke.call_args.kwargs['stderr'], subprocess.PIPE)
        subprocess.run(['node', '--test', 'tests/python-backend.test.mjs'], cwd=ENGINE, check=True)


if __name__ == '__main__':
    unittest.main()

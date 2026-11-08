"""Native Creator ABI/identity and explicit style contracts; no live client actions."""
import ctypes as C
from ctypes import wintypes as W
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

RUNTIME = Path(__file__).resolve().parents[1]
SCRIPTS = RUNTIME / 'scripts'
WORK = RUNTIME / 'work' / 'native-window-tests'


def load_window_module():
    spec = importlib.util.spec_from_file_location('creator_native_window_contract', SCRIPTS / 'native-window.py')
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(SCRIPTS))
    old = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    try:
        spec.loader.exec_module(module)
    finally:
        sys.dont_write_bytecode = old
        sys.path.pop(0)
    return module


class CreatorWindowStyleContracts(unittest.TestCase):
    def test_settings_batch_navigation_and_mapping_contracts(self):
        subprocess.run(['node', '--test', 'tests/settings-capture.test.mjs'], cwd=RUNTIME, check=True, timeout=90)

    def test_window_orchestration_and_explicit_style_contracts(self):
        subprocess.run(['node', '--test', 'tests/window-style.test.mjs'], cwd=RUNTIME, check=True, timeout=90)

    def test_python_native_abi_reads_only_a_test_owned_hidden_window(self):
        m = load_window_module()
        # Win32 WINDOWPLACEMENT: 3 UINTs, 2 POINTs and a RECT = 44 bytes.
        self.assertEqual(C.sizeof(m.Placement), 44)
        self.assertEqual(m.Placement.rcNormalPosition.offset, 28)
        saved = {'flags': 0, 'showCmd': 3, 'min': [-1, -1], 'max': [-1, -1], 'normal': [-400, 100, 0, 400]}
        value = m.placement_value(saved)
        self.assertEqual(value.length, 44)
        self.assertEqual(m.placement_data(value), saved)
        for malformed in [dict(saved, showCmd=True), dict(saved, showCmd=2), dict(saved, flags=8), dict(saved, normal=[1, 2, 1, 10]), dict(saved, min=[0.5, 1]), dict(saved, extra=1)]:
            with self.assertRaises(m.HostError):
                m.placement_value(malformed)
        api = m.NativeWindows()
        user32 = api.api
        create = user32.CreateWindowExW
        create.argtypes = [W.DWORD, W.LPCWSTR, W.LPCWSTR, W.DWORD, C.c_int, C.c_int, C.c_int, C.c_int, W.HWND, W.HMENU, W.HINSTANCE, W.LPVOID]
        create.restype = W.HWND
        user32.DestroyWindow.argtypes = [W.HWND]
        user32.DestroyWindow.restype = W.BOOL
        # No WS_VISIBLE, WS_EX_NOACTIVATE: never display or focus this fixture.
        hwnd = create(0x08000080, 'STATIC', '', 0x00CF0000, 100, 100, 400, 300, None, None, None, None)
        self.assertTrue(hwnd, 'CreateWindowExW must produce the isolated fixture')
        try:
            actual = api.snapshot(hwnd, os.getpid())
            rect = actual['placement']['normal']
            self.assertEqual([rect[2] - rect[0], rect[3] - rect[1]], [400, 300])
            self.assertEqual(actual['handle'], str(hwnd))
            self.assertFalse(user32.IsWindowVisible(hwnd))
            for operation in [lambda: api.snapshot(hwnd, os.getpid() + 100000), lambda: api.apply(hwnd, os.getpid() + 100000, actual['placement'])]:
                with self.assertRaisesRegex(m.HostError, 'owner changed'):
                    operation()
            self.assertEqual(api.snapshot(hwnd, os.getpid())['placement'], actual['placement'])
            self.assertFalse(user32.IsWindowVisible(hwnd))
        finally:
            self.assertTrue(user32.DestroyWindow(hwnd))

    def test_native_python_entry_refuses_unverified_or_reused_identity_before_mutation(self):
        m = load_window_module()
        state = {'ownerPid': 42}
        host = Mock()
        host.process.return_value = {'pid': 42, 'startedTicks': 'new-process'}
        api = Mock()
        api.snapshot.side_effect = AssertionError('An invalid token cannot access a window')
        api.apply.side_effect = AssertionError('An invalid token cannot mutate a window')
        token = json.dumps({'pid': 42, 'startedTicks': 'old-process', 'handle': '100'})
        with patch.object(m, 'read_json', return_value=state), patch.object(m, 'WindowsHost', return_value=host), patch.object(m, 'assert_owner'), patch.object(m, 'NativeWindows', return_value=api):
            with self.assertRaisesRegex(m.HostError, 'identity changed'):
                m.main(['--state', 'synthetic', '--operation', 'normal', '--token', token])
        api.snapshot.assert_not_called()
        api.apply.assert_not_called()
        with patch.object(m, 'read_json', return_value=state), patch.object(m, 'WindowsHost', return_value=host), patch.object(m, 'assert_owner', side_effect=m.HostError('owner rejected')), patch.object(m, 'NativeWindows') as windows:
            with self.assertRaisesRegex(m.HostError, 'owner rejected'):
                m.main(['--state', 'synthetic', '--operation', 'snapshot'])
            windows.assert_not_called()
        WORK.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='refusal-', dir=WORK) as temporary:
            folder = Path(temporary).resolve()
            self.assertTrue(folder.is_relative_to(WORK.resolve()))
            invalid = folder / 'invalid-session.json'
            invalid.write_text('{"port":1}', encoding='utf-8')
            result = subprocess.run([sys.executable, '-X', 'utf8', str(SCRIPTS / 'native-window.py'), '--state', str(invalid), '--operation', 'snapshot'], capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Invalid CDP port', result.stderr)

    def test_powershell_native_abi_and_json_conversion_without_client_access(self):
        # Compile the actual C# source, and extract the actual pure conversion
        # function through the PowerShell parser. No managed-session checks or
        # window enumeration/mutation run in this conversion case.
        command = r'''
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $env:WINDOW_SCRIPTS 'native-window.cs') -Raw)
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $env:WINDOW_SCRIPTS 'Native-CreatorWindow.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors.Message -join ';')}
$definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Convert-Placement'},$true)
if(!$definition){throw 'Placement conversion entry missing'}
. ([scriptblock]::Create($definition.Extent.Text))
$inputPlacement='{"flags":0,"showCmd":3,"min":[-1,-1],"max":[-1,-1],"normal":[-400,100,0,400]}' | ConvertFrom-Json
$native=Convert-Placement $inputPlacement
$refused=$false
try{[CodexCreatorNativeWindows]::Read([IntPtr]::Zero,[uint32]$PID)|Out-Null}catch{if($_.Exception.Message -notlike '*owner changed*'){throw};$refused=$true}
$badWidth=$false;$inputPlacement.normal=@(1,2,1,10)
try{Convert-Placement $inputPlacement|Out-Null}catch{$badWidth=$true}
@{size=[Runtime.InteropServices.Marshal]::SizeOf([type][CodexCreatorNativeWindows+PLACEMENT]);offset=[Runtime.InteropServices.Marshal]::OffsetOf([type][CodexCreatorNativeWindows+PLACEMENT],'normal').ToInt32();state=[int]$native.showCmd;normal=@($native.normal.left,$native.normal.top,$native.normal.right,$native.normal.bottom);ownerRejected=$refused;badSizeRejected=$badWidth}|ConvertTo-Json -Compress
'''
        result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], env={**os.environ, 'WINDOW_SCRIPTS': str(SCRIPTS)}, capture_output=True, text=True, check=True, timeout=30)
        self.assertEqual(json.loads(result.stdout), {'size': 44, 'offset': 28, 'state': 3, 'normal': [-400, 100, 0, 400], 'ownerRejected': True, 'badSizeRejected': True})
        WORK.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='ps-refusal-', dir=WORK) as temporary:
            folder = Path(temporary).resolve()
            self.assertTrue(folder.is_relative_to(WORK.resolve()))
            invalid = folder / 'invalid-session.json'
            invalid.write_text('{"port":1}', encoding='utf-8')
            result = subprocess.run(['powershell.exe', '-NoProfile', '-File', str(SCRIPTS / 'Native-CreatorWindow.ps1'), '-StatePath', str(invalid), '-Operation', 'snapshot'], capture_output=True, text=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Invalid CDP port', result.stderr)


if __name__ == '__main__':
    unittest.main()

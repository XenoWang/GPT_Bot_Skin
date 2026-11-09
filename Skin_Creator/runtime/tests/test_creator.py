"""Approved Creator rewrite scope: offline contracts and a synthetic image, no live app."""
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import zlib

ENGINE = Path(__file__).resolve().parents[1]
REPO = ENGINE.parent.parent
WORK = ENGINE / 'work' / 'creator-tests'


def two_color_png(width=32, height=16):
    # Independent PNG encoding: left half pure red, right half pure blue.
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    row = b'\x00' + b'\xff\x00\x00' * (width // 2) + b'\x00\x00\xff' * (width - width // 2)
    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(row * height)) + chunk(b'IEND', b'')


class CreatorContracts(unittest.TestCase):
    def setUp(self):
        WORK.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='creator-', dir=WORK)
        self.folder = Path(self.temp.name).resolve()
        if not self.folder.is_relative_to(WORK.resolve()):
            raise RuntimeError('Temporary path outside the approved test area')

    def tearDown(self):
        self.temp.cleanup()

    def test_creator_state_geometry_locales_export_and_preview_contracts(self):
        env = {**os.environ, 'CODEX_THEME_TEST_ROOT': str(self.folder)}
        subprocess.run(['node', '--test', 'tests/creator.test.mjs', 'tests/authoring.test.mjs', 'tests/contrast-audit.test.mjs', 'tests/theme-catalog.test.mjs'], cwd=ENGINE, env=env, check=True)

    def test_new_script_syntax_without_running_native_entrypoints(self):
        scripts = list((REPO / 'Skin_Creator' / 'scripts').glob('*.mjs'))
        scripts += [ENGINE / 'renderer' / 'authoring.mjs']
        scripts += [ENGINE / 'scripts' / name for name in ['region-capabilities.mjs', 'coverage-runner.mjs', 'managed-page.mjs', 'sync-shared-runtime.mjs', 'contrast-audit.mjs']]
        for script in scripts:
            subprocess.run(['node', '--check', str(script)], cwd=REPO, check=True)
        command = r'''$failures=@(); foreach($name in @('Create-Skin.ps1','scripts\image-codec.ps1')) { $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $env:CREATOR_ROOT $name),[ref]$tokens,[ref]$errors)|Out-Null; $failures+=@($errors) }; if($failures.Count){$failures|ForEach-Object {Write-Error $_.Message}; exit 1}'''
        subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], env={**os.environ, 'CREATOR_ROOT': str(REPO / 'Skin_Creator')}, check=True)

    def test_real_windows_codec_crops_known_pixels_and_refuses_overwrite(self):
        image = self.folder / 'input.png'
        original = two_color_png()
        image.write_bytes(original)
        output = self.folder / 'crop.png'
        spec = self.folder / 'spec.json'
        spec.write_text(json.dumps({'input': str(image), 'output': str(output), 'target': [8, 8], 'crop': [16, 0, 16, 16]}), encoding='utf-8')
        command = ['powershell.exe', '-NoProfile', '-File', str(REPO / 'Skin_Creator/scripts/image-codec.ps1'), '-SpecPath', str(spec)]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        measured = json.loads(result.stdout.lstrip('\ufeff'))
        self.assertEqual([measured['width'], measured['height']], [32, 16])
        self.assertEqual(image.read_bytes(), original)
        probe = r'''Add-Type -AssemblyName System.Drawing; $i=[Drawing.Image]::FromFile($env:IMAGE_PATH); try {$b=New-Object Drawing.Bitmap $i; try {$c=$b.GetPixel(4,4); @{width=$b.Width;height=$b.Height;red=$c.R;green=$c.G;blue=$c.B}|ConvertTo-Json -Compress} finally {$b.Dispose()}} finally {$i.Dispose()}'''
        pixels = json.loads(subprocess.run(['powershell.exe', '-NoProfile', '-Command', probe], env={**os.environ, 'IMAGE_PATH': str(output)}, capture_output=True, text=True, check=True).stdout)
        self.assertEqual(pixels, {'width': 8, 'height': 8, 'red': 0, 'green': 0, 'blue': 255})
        saved = output.read_bytes()
        rejected = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(output.read_bytes(), saved)
        self.assertEqual(image.read_bytes(), original)


if __name__ == '__main__':
    unittest.main()

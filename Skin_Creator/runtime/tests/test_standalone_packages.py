"""Independent-package and ZIP contracts. Only isolated copies are built/configured."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch

RUNTIME = Path(__file__).resolve().parents[1]
REPO = RUNTIME.parent.parent
sys.path.insert(0, str(RUNTIME / 'scripts'))
from release_package import PackageError, build_zip, release_entries
from python_launcher import launch_config


class StandalonePackages(unittest.TestCase):
    def setUp(self):
        work = RUNTIME / 'work' / 'standalone-tests'
        work.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='package-', dir=work)
        self.folder = Path(self.temporary.name).resolve()
        if not self.folder.is_relative_to(work.resolve()):
            raise RuntimeError('Isolated package outside the approved test area')

    def tearDown(self):
        self.temporary.cleanup()

    def test_source_layout_has_only_the_two_self_contained_package_roots(self):
        self.assertFalse((REPO / 'Skin_Engine').exists())
        for package, role in [('Skin_Creator', 'creator'), ('Skin_Usage', 'usage')]:
            root = REPO / package
            self.assertTrue((root / 'SKILL.md').is_file())
            self.assertTrue((root / 'Start-Skin.py').is_file())
            self.assertEqual(json.loads((root / 'runtime/runtime-profile.json').read_text(encoding='utf-8')), {'schemaVersion': 1, 'role': role})

    def stage(self, name):
        source = REPO / name
        manifest = json.loads((source / 'release-manifest.json').read_text(encoding='utf-8'))
        destination = self.folder / name / 'source copy'
        destination.mkdir(parents=True)
        for relative in ['release-manifest.json', *manifest['files']]:
            path = PurePosixPath(relative)
            self.assertFalse(path.is_absolute())
            self.assertNotIn('..', path.parts)
            target = destination / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / path, target)
        # These sentinels model a used working copy. They must never enter the ZIP.
        private = b'PRIVATE-ISOLATION-SENTINEL-DO-NOT-PUBLISH'
        for relative in ['runtime/launcher.json', 'runtime/launcher-python.json', 'work/session.json', '__pycache__/private.pyc']:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(private)
        return destination, manifest, private

    def pack_and_extract(self, name):
        stage, manifest, private = self.stage(name)
        output = self.folder / (name + '.zip')
        unrelated = self.folder / name / 'unrelated cwd'
        unrelated.mkdir()
        env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONPATH': ''}
        result = subprocess.run([sys.executable, '-X', 'utf8', str(stage / 'Build-Zip.py'), '--output', str(output)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout)['package'], name)
        with zipfile.ZipFile(output) as archive:
            expected = {name + '/' + relative for relative in ['release-manifest.json', *manifest['files']]}
            self.assertEqual(set(archive.namelist()), expected)
            for member in archive.infolist():
                self.assertNotIn('..', PurePosixPath(member.filename).parts)
                self.assertEqual(member.date_time, (1980, 1, 1, 0, 0, 0))
                data = archive.read(member)
                self.assertNotIn(private, data)
                relative = member.filename[len(name) + 1:]
                if relative in manifest['files']:
                    self.assertEqual(hashlib.sha256(data).hexdigest(), manifest['files'][relative])
            isolated = self.folder / name / 'extracted alone'
            archive.extractall(isolated)
        original = isolated / name
        renamed = isolated / 'arbitrary package name'
        self.assertTrue(original.resolve().is_relative_to(self.folder))
        self.assertTrue(renamed.resolve().is_relative_to(self.folder))
        original.rename(renamed)
        self.assertFalse((isolated / 'Skin_Engine').exists())
        self.assertFalse((isolated / 'Skin_Creator').exists())
        self.assertFalse((isolated / 'Skin_Usage').exists())
        return renamed, unrelated, env, manifest

    def check_modules_and_build(self, package, unrelated, env):
        # Import closure and source rebuild run from a renamed, isolated package.
        for file in package.rglob('*.mjs'):
            source = file.read_text(encoding='utf-8')
            self.assertNotIn('Skin_Engine', source)
            for match in re.finditer(r'\bfrom\s+[\'\"](\.[^\'\"]+)[\'\"]', source):
                resolved = (file.parent / match[1]).resolve()
                self.assertTrue(resolved.is_relative_to(package.resolve()), str(file))
                self.assertTrue(resolved.is_file(), str(resolved))
        output = self.folder / ('built-' + str(len(list(self.folder.iterdir()))))
        script = "import path from 'node:path';import {pathToFileURL} from 'node:url';const root=process.argv[1],out=process.argv[2];const {buildPayload}=await import(pathToFileURL(path.join(root,'runtime/scripts/build-cdp-payload.mjs')).href);console.log(await buildPayload(out));"
        subprocess.run(['node', '--input-type=module', '-e', script, str(package), str(output)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        # Reproducibility verifies that no assets outside the package are needed.
        self.assertEqual((output / 'cdp-payload.js').read_bytes(), (package / 'runtime/dist/cdp-payload.js').read_bytes())
        for entry in ['Start-Skin.py', 'Build-Zip.py']:
            result = subprocess.run([sys.executable, '-X', 'utf8', str(package / entry), '--help'], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
            self.assertIn('usage:', result.stdout.lower())

    def test_creator_zip_works_without_siblings_and_preserves_authoring_imports(self):
        package, unrelated, env, manifest = self.pack_and_extract('Skin_Creator')
        self.check_modules_and_build(package, unrelated, env)
        for name in ['runtime/renderer/authoring.mjs', 'runtime/scripts/coverage-runner.mjs', 'runtime/adapters/authoring-26.1103.json', 'scripts/creator.mjs', 'scripts/image-codec.py', 'AI_Skills/Pitfall/ThingsShouldBeAvoided.md']:
            self.assertIn(name, manifest['files'])
        help_result = subprocess.run([sys.executable, '-X', 'utf8', str(package / 'Create-Skin.py'), '--help'], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        self.assertIn('Creator', help_result.stdout)
        session = package / 'work' / 'isolated-session'
        session.mkdir(parents=True)
        state = {'schemaVersion': 1, 'id': 'isolated-fixture', 'name': 'Isolated fixture', 'suggestedLanguage': 'en', 'inventory': None, 'selection': None, 'source': None, 'prompt': None, 'assets': {}, 'palette': None, 'confirmations': {}, 'previews': {}, 'events': []}
        (session / 'session.json').write_text(json.dumps(state), encoding='utf-8')
        result = subprocess.run([sys.executable, '-X', 'utf8', str(package / 'Create-Skin.py'), 'status', '--session', str(session)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout)['id'], 'isolated-fixture')
        self.assertEqual(json.loads(result.stdout)['inventory'], None)

    def test_usage_zip_configures_independently_without_launching_a_client(self):
        package, unrelated, env, manifest = self.pack_and_extract('Skin_Usage')
        self.check_modules_and_build(package, unrelated, env)
        self.assertNotIn('runtime/renderer/authoring.mjs', manifest['files'])
        self.assertEqual(json.loads((package / 'runtime/runtime-profile.json').read_text(encoding='utf-8')), {'schemaVersion': 1, 'role': 'usage'})
        # Trap any accidental process/client activity while exercising the real entrypoint.
        script = "import sys,runpy;from pathlib import Path;root=Path(sys.argv[1]);sys.path.insert(0,str(root/'runtime/scripts'));import python_launcher as m\ndef forbidden(*a,**k): raise AssertionError('No client/process activity during configure')\nm.WindowsHost=forbidden;m.subprocess.Popen=forbidden;sys.argv=[str(root/'Start-Skin.py'),'configure','--proxy-mode','direct','--state-root',sys.argv[2]];runpy.run_path(sys.argv[0],run_name='__main__')"
        state = self.folder / 'usage-fixture-state'
        subprocess.run([sys.executable, '-X', 'utf8', '-c', script, str(package), str(state)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        config = json.loads((package / 'runtime/launcher-python.json').read_text(encoding='utf-8'))
        self.assertEqual(config, {'port': 9335, 'proxyMode': 'direct', 'proxyServer': '', 'stateRoot': str(state)})
        self.assertFalse((state / 'session.json').exists())

    def minimal(self):
        package = self.folder / 'minimal'
        package.mkdir()
        content = b'public fixture\n'
        (package / 'README.md').write_bytes(content)
        manifest = {'schemaVersion': 1, 'package': 'Skin_Creator', 'files': {'README.md': hashlib.sha256(content).hexdigest()}}
        (package / 'release-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        return package, manifest

    def test_packer_rejects_private_escape_duplicate_and_changed_files(self):
        package, manifest = self.minimal()
        for name in ['../escape.md', './README.md', 'a//b', 'C:/secret', 'runtime/work/status.json', 'runtime/launcher.json', 'AI_Skills/PRD/private.md']:
            changed = {**manifest, 'files': {name: '0' * 64}}
            (package / 'release-manifest.json').write_text(json.dumps(changed), encoding='utf-8')
            with self.assertRaisesRegex(PackageError, 'release path|Release path|Private|Runtime state'):
                release_entries(package)
        (package / 'release-manifest.json').write_text(json.dumps({**manifest, 'files': {**manifest['files'], 'readme.md': manifest['files']['README.md']}}), encoding='utf-8')
        with self.assertRaisesRegex(PackageError, 'Duplicate'):
            release_entries(package)
        (package / 'release-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')
        existing = self.folder / 'existing.zip'
        existing.write_bytes(b'KEEP-EXISTING-ZIP')
        with self.assertRaises(FileExistsError):
            build_zip(package, existing)
        self.assertEqual(existing.read_bytes(), b'KEEP-EXISTING-ZIP')
        (package / 'README.md').write_bytes(b'unreviewed change')
        with self.assertRaisesRegex(PackageError, 'changed'):
            build_zip(package, self.folder / 'changed.zip')
        self.assertFalse((self.folder / 'changed.zip').exists())

    def test_package_roles_keep_separate_defaults_and_reject_invalid_profiles(self):
        local = self.folder / 'local-app-data'
        for role, legacy_folder, python_folder in [('creator', 'CodexSkinCreator', 'CodexSkinCreatorPython'), ('usage', 'CodexSkin', 'CodexSkinPython')]:
            root = self.folder / role
            root.mkdir()
            profile = root / 'runtime-profile.json'
            profile.write_text(json.dumps({'schemaVersion': 1, 'role': role}), encoding='utf-8')
            with patch.dict(os.environ, {'LOCALAPPDATA': str(local)}):
                self.assertEqual(launch_config(root, mode='direct')['stateRoot'], str(local / python_folder))
            command = ". $env:PROFILE_HELPER; (Get-SkinLaunchConfig -Root $env:PROFILE_ROOT -ProxyMode direct).stateRoot"
            env = {**os.environ, 'PROFILE_HELPER': str(RUNTIME / 'scripts/Skin-LaunchConfig.ps1'), 'PROFILE_ROOT': str(root)}
            result = subprocess.run(['powershell.exe', '-NoProfile', '-Command', command], env=env, check=True, capture_output=True, text=True)
            self.assertEqual(Path(result.stdout.strip()).name, legacy_folder)
            for invalid in [{'schemaVersion': True, 'role': role}, {'schemaVersion': 1, 'role': 'unknown'}, {'schemaVersion': 1, 'role': role, 'extra': True}]:
                profile.write_text(json.dumps(invalid), encoding='utf-8')
                with self.assertRaises(HostErrorForProfile):
                    launch_config(root, mode='direct', state_root=str(self.folder / 'explicit'))
                rejected = subprocess.run(['powershell.exe', '-NoProfile', '-Command', "$ErrorActionPreference='Stop'; " + command], env=env, capture_output=True, text=True)
                self.assertNotEqual(rejected.returncode, 0)


from python_host import HostError as HostErrorForProfile

if __name__ == '__main__':
    unittest.main()

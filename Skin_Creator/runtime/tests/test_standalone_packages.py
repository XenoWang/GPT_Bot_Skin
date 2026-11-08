"""Independent-package and ZIP contracts. Only isolated copies are built/configured."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from test_creator import two_color_png

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

    def isolated_env(self, package, unrelated, *extra_paths):
        guard = self.folder / 'dependency-guard'
        guard.mkdir(exist_ok=True)
        for source, target in [('isolation_sitecustomize.py', 'sitecustomize.py'), ('module_dependencies.mjs', 'module_dependencies.mjs'), ('entry_diagnostics.mjs', 'entry_diagnostics.mjs')]:
            shutil.copy2(RUNTIME / 'tests/helpers' / source, guard / target)
        allowed = [package.resolve(), guard.resolve(), unrelated.resolve(), *(p.resolve() for p in extra_paths)]
        node = shutil.which('node')
        self.assertIsNotNone(node)
        env = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1', 'PYTHONNOUSERSITE': '1', 'PYTHONPATH': str(guard), 'NODE_PATH': '',
               'SKIN_ISOLATION_REPOSITORY': str(REPO.resolve()), 'SKIN_ISOLATION_ALLOWED': json.dumps([str(p) for p in allowed]),
               'SKIN_ISOLATION_EXECUTABLES': json.dumps([str(Path(sys.executable).resolve()), str(Path(node).resolve())]),
               'SKIN_ISOLATION_SCANNER': str(guard / 'module_dependencies.mjs'), 'SKIN_ISOLATION_ENTRY_DIAGNOSTICS': str(guard / 'entry_diagnostics.mjs')}
        version = subprocess.run([node, '--version'], check=True, capture_output=True, text=True).stdout.strip().lstrip('v')
        major, minor = map(int, version.split('.')[:2])
        permission = '--permission' if (major, minor) >= (22, 13) else '--experimental-permission'
        options = [permission, '--allow-child-process']
        for item in allowed:
            options += ['--allow-fs-read=' + item.as_posix(), '--allow-fs-write=' + item.as_posix()]
        env['NODE_OPTIONS'] = ' '.join(json.dumps(option) for option in options)
        return env

    def python_entry(self, entry, args, *, cwd, env):
        bootstrap = "import os,sys,runpy,sitecustomize;from pathlib import Path;sitecustomize.assert_active();assert sitecustomize.ACTIVE_PID==os.getpid();sys.argv=sys.argv[1:];sys.path.insert(0,str(Path(sys.argv[0]).resolve().parent));runpy.run_path(sys.argv[0],run_name='__main__')"
        return subprocess.run([sys.executable, '-X', 'utf8', '-c', bootstrap, str(entry), *args], cwd=cwd, env=env, check=True, capture_output=True, text=True)

    def parsed_modules(self, package, unrelated, env):
        result = subprocess.run(['node', '--experimental-vm-modules', env['SKIN_ISOLATION_SCANNER'], str(package)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        return json.loads(result.stdout)

    def check_relative_imports(self, package, unrelated, env):
        for record in self.parsed_modules(package, unrelated, env):
            file = package / record['file']
            self.assertNotIn('Skin_Engine', file.read_text(encoding='utf-8'))
            for specifier in record['specifiers']:
                if specifier.startswith('.'):
                    resolved = (file.parent / specifier).resolve()
                    self.assertTrue(resolved.is_relative_to(package.resolve()), str(resolved))
                    self.assertTrue(resolved.is_file(), str(resolved))
                else:
                    self.assertTrue(specifier.startswith('node:'), 'Undeclared external dependency: ' + specifier)

    def assert_public_unchanged(self, package, manifest):
        for name, expected in manifest['files'].items():
            self.assertEqual(hashlib.sha256((package / name).read_bytes()).hexdigest(), expected, name)

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
        env = self.isolated_env(stage, unrelated, output)
        result = self.python_entry(stage / 'Build-Zip.py', ['--output', str(output)], cwd=unrelated, env=env)
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
        return renamed, unrelated, self.isolated_env(renamed, unrelated), manifest

    def check_modules_and_build(self, package, unrelated, env):
        # Real module parsing ignores builder strings/comments. File permissions also
        # prevent the executed package from reading the original workspace packages.
        self.check_relative_imports(package, unrelated, env)
        output = self.folder / ('built-' + str(len(list(self.folder.iterdir()))))
        output.mkdir()
        env = self.isolated_env(package, unrelated, output)
        script = "import path from 'node:path';import {pathToFileURL} from 'node:url';const root=process.argv[1],out=process.argv[2];const {buildPayload}=await import(pathToFileURL(path.join(root,'runtime/scripts/build-cdp-payload.mjs')).href);console.log(await buildPayload(out));"
        subprocess.run(['node', '--input-type=module', '-e', script, str(package), str(output)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        # Reproducibility verifies that no assets outside the package are needed.
        self.assertEqual((output / 'cdp-payload.js').read_bytes(), (package / 'runtime/dist/cdp-payload.js').read_bytes())
        for entry in ['Start-Skin.py', 'Build-Zip.py']:
            result = self.python_entry(package / entry, ['--help'], cwd=unrelated, env=env)
            self.assertIn('usage:', result.stdout.lower())

    def test_creator_zip_works_without_siblings_and_preserves_authoring_imports(self):
        package, unrelated, env, manifest = self.pack_and_extract('Skin_Creator')
        self.check_modules_and_build(package, unrelated, env)
        for name in ['runtime/renderer/authoring.mjs', 'runtime/scripts/coverage-runner.mjs', 'runtime/scripts/window-control.mjs', 'runtime/scripts/native-window.py', 'runtime/scripts/native-window.cs', 'runtime/scripts/Native-CreatorWindow.ps1', 'runtime/adapters/authoring-26.1103.json', 'runtime/adapters/authoring-controls-26.1103.json', 'scripts/creator.mjs', 'scripts/image-codec.py', 'AI_Skills/Pitfall/ThingsShouldBeAvoided.md']:
            self.assertIn(name, manifest['files'])
        # Load the real new Python helper from the isolated package. Original
        # Creator/Usage reads remain denied by the inherited audit guard.
        import_window = "import sys,runpy,ctypes;from pathlib import Path;root=Path(sys.argv[1]);sys.path.insert(0,str(root/'runtime/scripts'));module=runpy.run_path(str(root/'runtime/scripts/native-window.py'));print(ctypes.sizeof(module['Placement']))"
        loaded = subprocess.run([sys.executable, '-X', 'utf8', '-c', import_window, str(package)], cwd=unrelated, env=env, capture_output=True, text=True, check=True)
        self.assertEqual(loaded.stdout.strip(), '44')
        help_result = self.python_entry(package / 'Create-Skin.py', ['--help'], cwd=unrelated, env=env)
        self.assertIn('Creator', help_result.stdout)
        session = package / 'work' / 'isolated-session'
        session.mkdir(parents=True)
        state = {'schemaVersion': 1, 'id': 'isolated-fixture', 'name': 'Isolated fixture', 'suggestedLanguage': 'en', 'inventory': None, 'selection': None, 'source': None, 'prompt': None, 'assets': {}, 'palette': None, 'confirmations': {}, 'previews': {}, 'events': []}
        (session / 'session.json').write_text(json.dumps(state), encoding='utf-8')
        result = self.python_entry(package / 'Create-Skin.py', ['status', '--session', str(session)], cwd=unrelated, env=env)
        try:
            status = json.loads(result.stdout)
        except json.JSONDecodeError:
            diagnostic_env = {**env, 'CODEX_SKIN_HOST_BACKEND': 'python', 'CODEX_SKIN_PYTHON': sys.executable}
            direct = subprocess.run(['node', '--import', Path(env['SKIN_ISOLATION_ENTRY_DIAGNOSTICS']).as_uri(), str(package / 'scripts/creator.mjs'), 'status', '--session', str(session)], cwd=unrelated, env=diagnostic_env, capture_output=True, text=True)
            self.fail('Creator entry did not emit JSON: ' + json.dumps({'python': {'returncode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr}, 'direct_node': {'returncode': direct.returncode, 'stdout': direct.stdout, 'stderr': direct.stderr}}, ensure_ascii=False))
        self.assertEqual(status['id'], 'isolated-fixture')
        self.assertEqual(status['inventory'], None)
        # Exercise the packaged image helper and its Python child under the same guard.
        state['selection'] = {'mode': 'unified', 'language': 'en', 'regions': ['chat'], 'excludedStates': [], 'sidebarSplit': False}
        state['source'] = {'kind': 'provided'}
        state['inventory'] = {'binding': 'isolated-fixture', 'measurement': {'maximized': True, 'pixelRatio': 1, 'canvas': {'window': [32, 16], 'main': [32, 16]}}}
        (session / 'session.json').write_text(json.dumps(state), encoding='utf-8')
        source = package / 'work' / 'source.png'
        source.write_bytes(two_color_png())
        result = self.python_entry(package / 'Create-Skin.py', ['asset', '--session', str(session), '--slot', 'scene', '--input', str(source), '--subject', 'null'], cwd=unrelated, env=env)
        self.assertEqual(json.loads(result.stdout)['target'], [32, 16])
        self.assertTrue(Path(json.loads(result.stdout)['image']).is_relative_to(package))
        self.assert_public_unchanged(package, manifest)

    def test_usage_zip_configures_independently_without_launching_a_client(self):
        package, unrelated, env, manifest = self.pack_and_extract('Skin_Usage')
        self.check_modules_and_build(package, unrelated, env)
        self.assertNotIn('runtime/renderer/authoring.mjs', manifest['files'])
        self.assertEqual(json.loads((package / 'runtime/runtime-profile.json').read_text(encoding='utf-8')), {'schemaVersion': 1, 'role': 'usage'})
        # Trap any accidental process/client activity while exercising the real entrypoint.
        script = "import sys,runpy;from pathlib import Path;root=Path(sys.argv[1]);sys.path.insert(0,str(root/'runtime/scripts'));import python_launcher as m\ndef forbidden(*a,**k): raise AssertionError('No client/process activity during configure')\nm.WindowsHost=forbidden;m.subprocess.Popen=forbidden;sys.argv=[str(root/'Start-Skin.py'),'configure','--proxy-mode','direct','--state-root',sys.argv[2]];runpy.run_path(sys.argv[0],run_name='__main__')"
        state = self.folder / 'usage-fixture-state'
        env = self.isolated_env(package, unrelated, state)
        subprocess.run([sys.executable, '-X', 'utf8', '-c', script, str(package), str(state)], cwd=unrelated, env=env, check=True, capture_output=True, text=True)
        config = json.loads((package / 'runtime/launcher-python.json').read_text(encoding='utf-8'))
        self.assertEqual(config, {'port': 9335, 'proxyMode': 'direct', 'proxyServer': '', 'stateRoot': str(state)})
        self.assertFalse((state / 'session.json').exists())
        self.assert_public_unchanged(package, manifest)

    def test_module_parser_ignores_import_text_but_rejects_real_missing_dependencies(self):
        package = self.folder / 'parser-package'
        package.mkdir()
        unrelated = self.folder / 'parser-cwd'
        unrelated.mkdir()
        (package / 'real.mjs').write_text('export const value=1;\n', encoding='utf-8')
        (package / 'entry.mjs').write_text("export {value} from './real.mjs';\nconst saved=\"import x from './phantom.mjs';\";\n/* import './comment-only.mjs'; */\n", encoding='utf-8')
        env = self.isolated_env(package, unrelated)
        records = {row['file']: row['specifiers'] for row in self.parsed_modules(package, unrelated, env)}
        self.assertEqual(records['entry.mjs'], ['./real.mjs'])
        self.check_relative_imports(package, unrelated, env)
        (package / 'entry.mjs').write_text("import './missing.mjs';\n", encoding='utf-8')
        with self.assertRaises(AssertionError):
            self.check_relative_imports(package, unrelated, env)

    def test_isolation_denies_both_original_packages_and_misplaced_sibling_functions(self):
        package = self.folder / 'guarded-package'
        package.mkdir()
        unrelated = self.folder / 'guarded-cwd'
        unrelated.mkdir()
        misplaced = self.folder / 'misplaced'
        misplaced.mkdir()
        helper = misplaced / 'helper.mjs'
        helper.write_text('export const value=1;\n', encoding='utf-8')
        (package / 'entry.mjs').write_text("import '../misplaced/helper.mjs';\n", encoding='utf-8')
        env = self.isolated_env(package, unrelated)
        with self.assertRaises(AssertionError):
            self.check_relative_imports(package, unrelated, env)
        targets = [REPO / 'Skin_Creator/SKILL.md', REPO / 'Skin_Usage/SKILL.md', helper]
        node_import = "import{pathToFileURL}from'node:url';try{await import(pathToFileURL(process.argv[1]).href);process.exitCode=0;}catch(e){console.log(JSON.stringify({code:e.code,resource:e.resource}));process.exitCode=37;}"
        denied_import = subprocess.run(['node', '--input-type=module', '-e', node_import, str(package / 'entry.mjs')], cwd=unrelated, env=env, capture_output=True, text=True)
        self.assertEqual(denied_import.returncode, 37)
        self.assertEqual(json.loads(denied_import.stdout)['code'], 'ERR_ACCESS_DENIED')
        self.assertTrue(os.path.samefile(json.loads(denied_import.stdout)['resource'], helper))
        node_read = "import{readFileSync}from'node:fs';try{readFileSync(process.argv[1]);process.exitCode=0;}catch(e){console.log(JSON.stringify({code:e.code,resource:e.resource}));process.exitCode=37;}"
        python_read = "import sitecustomize,sys;sitecustomize.assert_active();open(sys.argv[1],'rb').read()"
        for target in targets:
            self.assertTrue(target.is_file())
            denied = subprocess.run(['node', '--input-type=module', '-e', node_read, str(target)], cwd=unrelated, env=env, capture_output=True, text=True)
            self.assertEqual(denied.returncode, 37)
            result = json.loads(denied.stdout)
            self.assertEqual(result['code'], 'ERR_ACCESS_DENIED')
            self.assertTrue(os.path.samefile(result['resource'], target))
            denied = subprocess.run([sys.executable, '-X', 'utf8', '-c', python_read, str(target)], cwd=unrelated, env=env, capture_output=True, text=True)
            self.assertNotEqual(denied.returncode, 0)
            self.assertIn('SKIN_TEST_ISOLATION_BLOCKED', denied.stderr)
            if os.name == 'nt':
                namespaced = '\\\\?\\' + str(target.resolve())
                denied_alias = subprocess.run([sys.executable, '-X', 'utf8', '-c', python_read, namespaced], cwd=unrelated, env=env, capture_output=True, text=True)
                self.assertNotEqual(denied_alias.returncode, 0)
                self.assertIn('SKIN_TEST_ISOLATION_BLOCKED', denied_alias.stderr)
        # Verify the Python guard is inherited through the same Node child-process path.
        child = "import{execFileSync}from'node:child_process';try{execFileSync(process.argv[1],['-X','utf8','-c',process.argv[2],process.argv[3]],{stdio:'pipe'});process.exitCode=0;}catch(e){process.stdout.write(String(e.stderr));process.exitCode=37;}"
        denied = subprocess.run(['node', '--input-type=module', '-e', child, sys.executable, python_read, str(REPO / 'Skin_Usage/SKILL.md')], cwd=unrelated, env=env, capture_output=True, text=True)
        self.assertEqual(denied.returncode, 37)
        self.assertIn('SKIN_TEST_ISOLATION_BLOCKED', denied.stdout)

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

"""Offline contract tests; no live client, credentials, ACLs or network access."""
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parent.parent
WORK=ROOT/'work'/'appearance-tests'
spec=importlib.util.spec_from_file_location('patcher',ROOT/'scripts'/'build_native_patch.py')
patcher=importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)

def fixture(path):
    # Independently encoded minimal ASAR, per pickle+relative-offset archive format.
    files={'package.json':b'{"name":"openai-codex-electron","version":"fixture"}',
           'webview/index.html':b'<!doctype html><html><body><main>untouched</main></body></html>',
           'webview/keep.bin':b'\x00KEEP\xff\x01'}
    tree={'files':{}};offset=0
    for name,data in files.items():
        node=tree
        parts=name.split('/')
        for part in parts[:-1]:node=node['files'].setdefault(part,{'files':{}})
        node['files'][parts[-1]]={'size':len(data),'offset':str(offset)};offset+=len(data)
    raw=json.dumps(tree,separators=(',',':')).encode();pad=b'\x00'*((-(len(raw)+4))%4)
    path.write_bytes(struct.pack('<4I',4,len(raw)+len(pad)+8,len(raw)+len(pad)+4,len(raw))+raw+pad+b''.join(files.values()))
    return files

def independent_read(path,name):
    data=path.read_bytes();_,size,_,length=struct.unpack('<4I',data[:16]);node=json.loads(data[16:16+length])
    for part in name.split('/'):node=node['files'][part]
    start=8+size+int(node['offset']);return data[start:start+node['size']]

class Contracts(unittest.TestCase):
    def setUp(self):
        WORK.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(prefix='contract-',dir=WORK)
        self.folder=Path(self.tmp.name).resolve()
        if not self.folder.is_relative_to(WORK.resolve()):raise RuntimeError('Temporary path outside workspace')
    def tearDown(self):self.tmp.cleanup()
    def resources(self):
        folder=self.folder/'dist';folder.mkdir()
        for name in ['core.mjs','runtime.mjs','adapter.json','builtin.json','locales.json']:(folder/name).write_bytes(('fixture:'+name).encode())
        return folder
    def test_stage_preserves_original_and_unrelated_bytes(self):
        src=self.folder/'source.asar';files=fixture(src);before=src.read_bytes();dist=self.resources();out=self.folder/'candidate.asar'
        receipt=patcher.stage(src,dist,out)
        self.assertEqual(src.read_bytes(),before)
        self.assertEqual(independent_read(out,'webview/keep.bin'),files['webview/keep.bin'])
        self.assertEqual(independent_read(out,'package.json'),files['package.json'])
        html=independent_read(out,'webview/index.html')
        self.assertEqual(html.count(b'codex-appearance-loader-v1'),1)
        self.assertIn(b'<main>untouched</main>',html)
        for name in ['core.mjs','runtime.mjs','adapter.json','builtin.json','locales.json']:
            self.assertEqual(independent_read(out,'webview/assets/codex-appearance/'+name),(dist/name).read_bytes())
        self.assertEqual(receipt['status'],'staged-not-installed')
    def test_refuses_overwrite_and_protected_output(self):
        src=self.folder/'source.asar';fixture(src);dist=self.resources();before=src.read_bytes()
        for out in [src,self.folder/'WindowsApps'/'candidate.asar']:
            with self.assertRaises(ValueError):patcher.stage(src,dist,out)
        self.assertEqual(src.read_bytes(),before)
    def test_refuses_repatch_without_clean_source(self):
        src=self.folder/'source.asar';fixture(src);dist=self.resources();out=self.folder/'candidate.asar';patcher.stage(src,dist,out)
        with self.assertRaises(ValueError):patcher.stage(out,dist,self.folder/'again.asar')
    def test_node_contracts_and_syntax(self):
        env={**os.environ,'CODEX_THEME_TEST_ROOT':str(self.folder)}
        subprocess.run(['node','--check','renderer/runtime.mjs'],cwd=ROOT,env=env,check=True)
        subprocess.run(['node','--test','tests/core.test.mjs'],cwd=ROOT,env=env,check=True)
    def test_skill_frontmatter_validator(self):
        validator=Path(os.environ['CODEX_SKILL_VALIDATOR']) if os.environ.get('CODEX_SKILL_VALIDATOR') else Path.home()/'.codex'/'skills'/'.system'/'skill-creator'/'scripts'/'quick_validate.py'
        if not validator.is_file():self.fail('BLOCKED: installed skill validator unavailable')
        env=dict(os.environ)
        if importlib.util.find_spec('yaml') is None:
            dependencies=ROOT/'tests'/'_deps'
            if not (dependencies/'yaml'/'__init__.py').is_file():
                self.fail('BLOCKED: prepare the isolated tests/requirements.txt dependencies first')
            env['PYTHONPATH']=str(dependencies)
        for skill in [ROOT/'skills'/'manage-themes',REPO/'Skin_Creator',REPO/'Skin_Usage']:
            subprocess.run([sys.executable,'-X','utf8',str(validator),str(skill)],env=env,check=True)

    def test_cdp_contracts_and_launcher_syntax(self):
        for script in ['scripts/cdp-transport.mjs','scripts/cdp-companion.mjs','scripts/build-cdp-payload.mjs']:
            subprocess.run(['node','--check',script],cwd=ROOT,check=True)
        subprocess.run(['node','--test','tests/cdp.test.mjs'],cwd=ROOT,check=True)
        command=r'''$allErrors=@(); foreach($name in @('Start-CodexTheme.ps1','Assert-CdpOwner.ps1','Restore-CodexAppearance.ps1','Configure-CodexSkin.ps1','Skin-LaunchConfig.ps1')) { $tokens=$null; $parseErrors=$null; [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $env:CODEX_PLUGIN_ROOT ('scripts\'+$name)),[ref]$tokens,[ref]$parseErrors) | Out-Null; if($parseErrors.Count){$allErrors+=$parseErrors} }; if($allErrors.Count){$allErrors | ForEach-Object {Write-Error $_.Message}; exit 1}'''
        subprocess.run(['powershell.exe','-NoProfile','-Command',command],env={**os.environ,'CODEX_PLUGIN_ROOT':str(ROOT)},cwd=ROOT,check=True)

    def test_sidebar_split_contracts(self):
        subprocess.run(['node','--test','tests/sidebar.test.mjs'],cwd=ROOT,check=True)

    def test_manager_ownership_and_lifecycle(self):
        subprocess.run(['node','--test','tests/manager.test.mjs'],cwd=ROOT,check=True)

    def test_sidebar_crop_and_asset_selection(self):
        subprocess.run(['node','--test','tests/crop.test.mjs'],cwd=ROOT,check=True)

    def test_crimson_theme_contracts(self):
        subprocess.run(['node','--test','tests/crimson.test.mjs'],cwd=ROOT,check=True)

    def test_botanical_popup_contracts(self):
        subprocess.run(['node','--test','tests/botanical.test.mjs'],cwd=ROOT,check=True)

    def test_route_layout_contracts(self):
        subprocess.run(['node','--test','tests/route-layout.test.mjs'],cwd=ROOT,check=True)

    def test_opacity_and_translation_contracts(self):
        env={**os.environ,'CODEX_THEME_TEST_ROOT':str(self.folder)}
        subprocess.run(['node','--test','tests/controls.test.mjs'],cwd=ROOT,env=env,check=True)

    def test_read_only_ui_inventory_and_entrypoints(self):
        env={**os.environ,'CODEX_THEME_TEST_ROOT':str(self.folder),'CODEX_REPOSITORY_ROOT':str(REPO)}
        subprocess.run(['node','--check','scripts/inspect-ui-regions.mjs'],cwd=ROOT,check=True)
        subprocess.run(['node','--test','tests/inventory.test.mjs'],cwd=ROOT,env=env,check=True)
        expected=(ROOT/'Inspect-UI.ps1').read_bytes()
        for folder in ['Skin_Creator','Skin_Usage']:
            self.assertEqual((REPO/folder/'Inspect-UI.ps1').read_bytes(),expected)
        command=r'''$failures=@(); foreach($folder in @('Skin_Creator/runtime','Skin_Creator','Skin_Usage')) { $tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $env:CODEX_REPOSITORY_ROOT ($folder+'\Inspect-UI.ps1')),[ref]$tokens,[ref]$errors)|Out-Null; $failures+=@($errors) }; if($failures.Count){$failures|ForEach-Object {Write-Error $_.Message}; exit 1}'''
        subprocess.run(['powershell.exe','-NoProfile','-Command',command],env=env,check=True)

    def test_portable_config_modes_without_launching_client(self):
        import shutil
        folder=self.folder/'portable-runtime';scripts=folder/'scripts';scripts.mkdir(parents=True)
        for name in ['Skin-LaunchConfig.ps1','Configure-CodexSkin.ps1']:
            shutil.copyfile(ROOT/'scripts'/name,scripts/name)
        # Only pure plan helpers and a temporary config writer run; never the real launcher or shortcut.
        for mode in ['proxy','direct']:
            subprocess.run(['powershell.exe','-NoProfile','-File',str(scripts/'Configure-CodexSkin.ps1'),'-ProxyMode',mode,'-ProxyServer','127.0.0.1:7897','-StateRoot',str(self.folder/'runtime-state')],check=True)
            config=json.loads((folder/'launcher.json').read_text(encoding='utf-8'))
            self.assertEqual(config['proxyMode'],mode)
            self.assertEqual(config['proxyServer'],'127.0.0.1:7897' if mode=='proxy' else '')
            self.assertEqual(Path(config['stateRoot']),self.folder/'runtime-state')
            command=". (Join-Path $env:SKIN_FIXTURE_ROOT 'scripts/Skin-LaunchConfig.ps1'); $c=Get-SkinLaunchConfig -Root $env:SKIN_FIXTURE_ROOT; @(Get-SkinClientArguments -Config $c) | ConvertTo-Json -Compress"
            result=subprocess.run(['powershell.exe','-NoProfile','-Command',command],env={**os.environ,'SKIN_FIXTURE_ROOT':str(folder)},check=True,capture_output=True,text=True)
            args=json.loads(result.stdout)
            expected=['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9335']
            expected+=['--proxy-server=http://127.0.0.1:7897','--proxy-bypass-list=localhost;127.0.0.1;[::1]'] if mode=='proxy' else ['--no-proxy-server']
            self.assertEqual(args,expected)
        self.assertEqual(json.loads((folder/'launcher.json.previous').read_text(encoding='utf-8'))['proxyMode'],'proxy')
        (folder/'launcher.json').unlink()
        command=". (Join-Path $env:SKIN_FIXTURE_ROOT 'scripts/Skin-LaunchConfig.ps1'); try { Get-SkinLaunchConfig -Root $env:SKIN_FIXTURE_ROOT; exit 1 } catch { exit 0 }"
        subprocess.run(['powershell.exe','-NoProfile','-Command',command],env={**os.environ,'SKIN_FIXTURE_ROOT':str(folder)},check=True)

    def test_delivery_is_self_contained_and_matches_frozen_source(self):
        import hashlib
        usage=REPO/'Skin_Usage'
        receipt=json.loads((usage/'references/runtime-files.json').read_text(encoding='utf-8'))['files']
        self.assertGreater(len(receipt),20)
        for name,digest in receipt.items():
            rel=Path(name);self.assertFalse(rel.is_absolute());self.assertNotIn('..',rel.parts)
            self.assertEqual(hashlib.sha256((usage/'runtime'/rel).read_bytes()).hexdigest(),digest,name)
            if name=='runtime-profile.json':
                self.assertEqual(json.loads((usage/'runtime'/rel).read_text(encoding='utf-8')),{'schemaVersion':1,'role':'usage'})
                self.assertEqual(json.loads((ROOT/rel).read_text(encoding='utf-8')),{'schemaVersion':1,'role':'creator'})
            else:
                self.assertEqual((usage/'runtime'/rel).read_bytes(),(ROOT/rel).read_bytes(),name)
        forbidden={'session.json','status.json','launcher.json','launcher-python.json','launcher-python.json.previous','python-companion.json','build_native_patch.py','app.asar'}
        # Local working state is allowed; the independently checked ZIP must exclude it.
        release=json.loads((usage/'release-manifest.json').read_text(encoding='utf-8'))['files']
        self.assertFalse(forbidden.intersection(Path(name).name for name in release))
        for name in receipt:
            self.assertIn('runtime/'+name,release)
        for kind in ['Start','Restore','Configure']:
            self.assertTrue((usage/(kind+'-Skin.cmd')).is_file())
        # Mandatory release snapshot uses repository-relative paths, never personal history.
        freeze=json.loads((ROOT/'tests/fixtures/release-files.json').read_text(encoding='utf-8'))
        self.assertGreaterEqual(len(freeze['files']),79)
        for name,digest in freeze['files'].items():
            rel=Path(name)
            self.assertFalse(rel.is_absolute())
            self.assertNotIn('..',rel.parts)
            target=(REPO/rel).resolve()
            self.assertTrue(target.is_relative_to(REPO.resolve()))
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(),digest,name)

if __name__=='__main__':unittest.main()

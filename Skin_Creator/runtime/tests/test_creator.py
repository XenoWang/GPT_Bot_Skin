"""Approved Creator rewrite scope: offline contracts and a synthetic image, no live app."""
import json
import os
from pathlib import Path
import struct
import subprocess
import statistics
import tempfile
import time
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
        subprocess.run(['node', '--test', 'tests/creator.test.mjs', 'tests/authoring.test.mjs', 'tests/contrast-audit.test.mjs', 'tests/theme-catalog.test.mjs', 'tests/recovery.test.mjs'], cwd=ENGINE, env=env, check=True)

    def test_real_cli_export_matrix_and_bounded_timing_samples(self):
        # Native inventory and visual acceptance are explicitly synthetic here;
        # image processing, session writes, confirmations and export are real CLI paths.
        parent = REPO / 'Skin_Creator' / 'work'
        parent.mkdir(exist_ok=True)
        self.assertTrue(parent.resolve().is_relative_to(REPO.resolve()))
        cases = {
            'unified': {'mode': 'unified', 'split': False, 'sizes': {'scene': [4, 4]}},
            'separate': {'mode': 'separate', 'split': False, 'sizes': {'chat': [3, 3], 'sidebar': [1, 3]}},
            'separate-split': {'mode': 'separate', 'split': True, 'sizes': {'chat': [3, 3], 'sidebar': [1, 3], 'sidebarHeader': [1, 1], 'sidebarBody': [1, 2]}},
        }
        cases = {prefix + name: {**case, 'clientVersion': version}
                 for prefix, version in [('', '26.1103.4239.0'), ('current-', '26.1111.2228.0')]
                 for name, case in cases.items()}
        script = r'''
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const [root,folder,name]=process.argv.slice(1),spec=JSON.parse(await readFile(path.join(folder,'fixture.json'),'utf8'));
const {createSession,requiredSlots,completeRevision}=await import(pathToFileURL(path.join(root,'scripts/workflow.mjs')));
const {run}=await import(pathToFileURL(path.join(root,'scripts/creator.mjs')));
const regions=['chat','sidebar','menus','userMessages'],s=createSession('matrix-'+name,'Synthetic matrix','en');s.foregrounds={menus:['#FFFFFF'],userMessages:['#FFFFFF']};
const canvas={window:[4,4],main:[3,3],mainOrigin:[1,1],sidebarHeaderHeight:1};
s.inventory={binding:'synthetic-export',clientVersion:spec.clientVersion,adapterVersion:spec.clientVersion,measurement:{maximized:true,pixelRatio:1,canvas,windowed:{pixelRatio:1,canvas}},coverage:{restored:true,states:[{id:'fixture',status:'observed',regions}]},samples:[{label:'fixture',viewport:[4,4],regionCoverage:[{key:'sidebar',matched:1,visible:1,samples:[{visible:true,rect:[1,1,1,3]}]}]}]};
s.catalog={regions:regions.map(key=>({key,label:{en:key},status:'observed',configuration:[],reasons:[],requiresAdapterReview:false})),candidates:[]};
await writeFile(path.join(folder,'session.json'),JSON.stringify(s));
await writeFile(path.join(folder,'choices.json'),JSON.stringify({mode:spec.mode,sidebarSplit:spec.split,language:'en',regions}));
await writeFile(path.join(folder,'source.json'),JSON.stringify({kind:'provided'}));
await writeFile(path.join(folder,'colors.json'),JSON.stringify({mode:'custom',colors:['#402030'],style:{text:'#FFFFFF'},regionStyles:{userMessages:{surfaceOpacity:.85}},ornaments:{menus:{pattern:'cross-emblem',orientation:'horizontal',color:'#30223F',accent:'#8DC6E8',opacity:.4,scale:.5,placement:'top-right',offset:[6,2]}}}));
const args=['--session',folder],started=performance.now();
await run(['select',...args,'--input',path.join(folder,'choices.json')]);await run(['source',...args,'--input',path.join(folder,'source.json')]);
const before=JSON.parse(await readFile(path.join(folder,'session.json'),'utf8'));
assert.deepEqual(Object.fromEntries(requiredSlots(before).map(x=>[x.id,x.target])),spec.sizes);
for(const slot of Object.keys(spec.sizes))await run(['asset',...args,'--slot',slot,'--input',path.join(folder,'inputs',slot+'.png'),'--subject','[0,0,1,1]']);
const background=await run(['background',...args]);
let state=JSON.parse(await readFile(path.join(folder,'session.json'),'utf8'));state.previews.background={revision:background.revision,applied:true,uncoveredScene:false};await writeFile(path.join(folder,'session.json'),JSON.stringify(state));
await run(['confirm',...args,'--stage','background','--revision',background.revision,'--note','Synthetic visual acceptance, no live client']);
await run(['colors',...args,'--input',path.join(folder,'colors.json')]);
state=JSON.parse(await readFile(path.join(folder,'session.json'),'utf8'));const revision=completeRevision(state);state.previews.complete={revision,applied:true,uncoveredScene:false,contrast:{passed:true,notApplicable:true}};await writeFile(path.join(folder,'session.json'),JSON.stringify(state));
await run(['confirm',...args,'--stage','complete','--revision',revision,'--note','Synthetic visual acceptance, no live client']);
const exported=await run(['export',...args,'--output',path.join(folder,'exported')]);const pipelineMs=performance.now()-started,statusMs=[];let fullChars=0,briefChars=0;
for(let i=0;i<3;i++){const full=await run(['status',...args]);const t=performance.now();const status=await run(['status',...args,'--format','brief']);assert.equal(status.id,'matrix-'+name);assert.equal(status.inventory.version,spec.clientVersion);assert.equal(status.backgroundRevision,full.backgroundRevision);statusMs.push(performance.now()-t);fullChars=JSON.stringify(full).length;briefChars=JSON.stringify(status).length;assert.ok(briefChars<fullChars);}
console.log(JSON.stringify({mode:name,clientVersion:spec.clientVersion,pipelineMs,statusMs,fullChars,briefChars,files:exported.files}));
'''
        with tempfile.TemporaryDirectory(prefix='dual-mode-', dir=parent) as temporary:
            base = Path(temporary).resolve()
            self.assertEqual(base.parent, parent.resolve())
            for name, case in cases.items():
                folder = base / name
                (folder / 'inputs').mkdir(parents=True)
                (folder / 'fixture.json').write_text(json.dumps(case), encoding='utf-8')
                for slot, (width, height) in case['sizes'].items():
                    (folder / 'inputs' / (slot + '.png')).write_bytes(two_color_png(width, height))
                started = time.perf_counter()
                result = subprocess.run(['node', '--input-type=module', '-e', script, str(REPO / 'Skin_Creator'), str(folder), name], cwd=REPO, capture_output=True, text=True, check=True, timeout=45)
                metrics = json.loads(result.stdout)
                expected_files = {'manifest.json', *('assets/' + slot + '.png' for slot in case['sizes'])}
                actual_files = {p.relative_to(folder / 'exported').as_posix() for p in (folder / 'exported').rglob('*') if p.is_file()}
                self.assertEqual(actual_files, expected_files)
                self.assertEqual(metrics['files'], len(expected_files))
                for slot, size in case['sizes'].items():
                    output = (folder / 'exported' / 'assets' / (slot + '.png')).read_bytes()
                    self.assertEqual(list(struct.unpack('>II', output[16:24])), size)
                manifest = json.loads((folder / 'exported' / 'manifest.json').read_text(encoding='utf-8'))
                self.assertEqual(manifest['scene']['scope'], 'window' if case['mode'] == 'unified' else 'main')
                self.assertEqual(metrics['clientVersion'], case['clientVersion'])
                self.assertEqual(manifest.get('sidebarLayout', {}).get('mode'), 'split' if case['split'] else None)
                self.assertEqual(manifest['regions']['userMessages']['style']['surfaceOpacity'], .85)
                self.assertEqual(manifest['regions']['menus']['ornament']['pattern'], 'cross-emblem')
                for forbidden in ['source', 'prompt', 'confirmations', 'controlContrast']:
                    self.assertNotIn(forbidden, manifest)
                self.assertEqual(len(metrics['statusMs']), 3)
                print(json.dumps({'scenario': name, 'clientVersion': case['clientVersion'], 'wallMs': round((time.perf_counter()-started)*1000), 'pipelineMs': round(metrics['pipelineMs']), 'statusMedianMs': round(statistics.median(metrics['statusMs'])), 'fullChars': metrics['fullChars'], 'briefChars': metrics['briefChars'], 'files': metrics['files'], 'timingScope': 'tiny synthetic assets; no live UI or image generation; characters are not billed tokens'}))

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

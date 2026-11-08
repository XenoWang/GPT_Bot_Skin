"""Build an offline ASAR candidate. Never overwrites or installs into a live app."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import struct
import tempfile
import os

MARKER = '<!-- codex-appearance-loader-v1 -->'
LOADER = MARKER + '\n<script type="module" src="/assets/codex-appearance/runtime.mjs"></script>\n'

def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

class Archive:
    def __init__(self, path):
        self.path = Path(path).resolve()
        with self.path.open('rb') as f:
            start = f.read(16)
            if len(start) != 16:
                raise ValueError('Truncated ASAR')
            magic, size, payload, length = struct.unpack('<4I', start)
            if magic != 4 or not 0 < length <= 32 * 1024 * 1024 or size != payload + 4 or length + 8 > size:
                raise ValueError('Invalid ASAR header')
            self.header = json.loads(f.read(length))
            self.base = size + 8
        self.data_size = self.path.stat().st_size - self.base
        if self.data_size < 0:
            raise ValueError('Truncated data')

    def entry(self, name):
        node = self.header
        for part in name.split('/'):
            if part in ('', '.', '..'):
                raise ValueError('Invalid member path')
            node = node['files'][part]
        return node

    def read(self, name):
        entry = self.entry(name)
        if entry.get('unpacked') or 'link' in entry:
            raise ValueError('Expected an ordinary packed member')
        offset, size = int(entry['offset']), entry['size']
        if offset < 0 or size < 0 or offset + size > self.data_size:
            raise ValueError('Invalid member bounds')
        with self.path.open('rb') as f:
            f.seek(self.base + offset)
            data = f.read(size)
        if len(data) != size:
            raise ValueError('Truncated member')
        return data

def header_bytes(header):
    data = json.dumps(header, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    payload = struct.pack('<I', len(data)) + data
    payload += b'\0' * (-len(payload) % 4)
    pickle = struct.pack('<I', len(payload)) + payload
    return struct.pack('<II', 4, len(pickle)) + pickle

def add_entry(header, name, data, offset):
    node = header
    parts = name.split('/')
    for part in parts[:-1]:
        node = node['files'].setdefault(part, {'files': {}})
        if 'files' not in node:
            raise ValueError('Member parent is not a directory')
    block = 4 * 1024 * 1024
    node['files'][parts[-1]] = {'size': len(data), 'offset': str(offset), 'integrity': {
        'algorithm': 'SHA256', 'hash': hashlib.sha256(data).hexdigest(),
        'blockSize': block, 'blocks': [hashlib.sha256(data[i:i+block]).hexdigest() for i in range(0, len(data), block)]}}

def stage(source, dist, output):
    source, dist, output = Path(source).resolve(), Path(dist).resolve(), Path(output).resolve()
    if source == output or output.exists():
        raise ValueError('Output must be a new offline file; source cannot be replaced')
    if any(p.lower() == 'windowsapps' for p in output.parts):
        raise ValueError('Cannot write a protected installation directory')
    before = sha(source)
    archive = Archive(source)
    package = json.loads(archive.read('package.json'))
    if package.get('name') != 'openai-codex-electron':
        raise ValueError('Not the expected Codex archive')
    html = archive.read('webview/index.html').decode('utf-8')
    if MARKER in html:
        raise ValueError('Archive already has a loader; use the clean original')
    if html.count('</body>') != 1:
        raise ValueError('Unknown entrypoint structure')
    payloads = {'webview/index.html': html.replace('</body>', LOADER + '</body>').encode('utf-8')}
    for name in ('core.mjs', 'runtime.mjs', 'adapter.json', 'builtin.json', 'locales.json'):
        data = (dist / name).read_bytes()
        if not data:
            raise ValueError('Empty plugin resource')
        member = 'webview/assets/codex-appearance/' + name
        try:
            archive.entry(member)
        except KeyError:
            pass
        else:
            raise ValueError('Plugin resource collision')
        payloads[member] = data
    header = copy.deepcopy(archive.header)
    offset = archive.data_size
    for name, data in payloads.items():
        add_entry(header, name, data, offset)
        offset += len(data)
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='appearance-', suffix='.tmp', dir=output.parent)
    try:
        with os.fdopen(fd, 'wb') as dest, source.open('rb') as original:
            dest.write(header_bytes(header)); original.seek(archive.base)
            shutil.copyfileobj(original, dest, 1024 * 1024)
            for data in payloads.values():
                dest.write(data)
            dest.flush(); os.fsync(dest.fileno())
        if sha(source) != before:
            raise ValueError('Source changed while staging; candidate discarded')
        # Exclusive publication never overwrites an unrelated file created concurrently.
        os.link(tmp, output)
    finally:
        Path(tmp).unlink(missing_ok=True)
    receipt = {'status':'staged-not-installed', 'packageVersion':package.get('version'),
               'source':str(source), 'sourceSHA256':before, 'candidateSHA256':sha(output),
               'changedMembers':list(payloads),
               'unverified':['host ASAR integrity/signature compatibility','runtime selectors','native UI theme switching']}
    receipt_path = output.with_suffix(output.suffix + '.receipt.json')
    with receipt_path.open('x', encoding='utf-8') as f:
        json.dump(receipt, f, ensure_ascii=False, indent=2)
    return receipt

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--asar',required=True)
    parser.add_argument('--dist',required=True)
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    print(json.dumps(stage(args.asar,args.dist,args.output),ensure_ascii=False,indent=2))

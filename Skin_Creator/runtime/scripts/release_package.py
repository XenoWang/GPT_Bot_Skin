"""Build one package from its explicit public allowlist; never zip a working tree blindly."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile


class PackageError(RuntimeError):
    pass


def safe_relative(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name:
        raise PackageError('Invalid release path')
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name or any(part in ('', '.', '..') or part.endswith((' ', '.')) for part in path.parts):
        raise PackageError('Release path escapes its package')
    lowered = [part.casefold() for part in path.parts]
    if any(part in ('.git', '.local', '__pycache__', 'work', 'tests', 'test_results', 'reports') for part in lowered):
        raise PackageError('Private/development path in release allowlist')
    if 'ai_skills' in lowered and name != 'AI_Skills/Pitfall/ThingsShouldBeAvoided.md':
        raise PackageError('Private project records must not be released')
    if path.name.casefold().startswith('launcher') or path.name.casefold() in ('session.json', 'status.json', 'python-companion.json', 'stop') or path.suffix.casefold() in ('.log', '.pyc', '.pyo', '.lnk', '.zip'):
        raise PackageError('Runtime state or generated output in release allowlist')
    return path


def checked_file(root, relative):
    target = root / relative
    for part in (target, *target.parents):
        if not part.is_relative_to(root):
            break
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), 'st_file_attributes', 0) & 0x400):
            raise PackageError('Release files must not use links or reparse points')
    if not target.is_file() or not target.resolve().is_relative_to(root):
        raise PackageError('Release file is missing or outside the package: ' + str(relative))
    return target


def release_entries(root):
    root = Path(root).absolute()
    if root.is_symlink() or getattr(root.lstat(), 'st_file_attributes', 0) & 0x400:
        raise PackageError('Package root must not be a link')
    root = root.resolve()
    manifest_path = checked_file(root, 'release-manifest.json')
    raw = manifest_path.read_bytes()
    if len(raw) > 4 * 1024 * 1024:
        raise PackageError('Release manifest too large')
    manifest = json.loads(raw)
    if not isinstance(manifest, dict) or set(manifest) != {'schemaVersion', 'package', 'files'} or type(manifest['schemaVersion']) is not int or manifest['schemaVersion'] != 1 or manifest['package'] not in ('Skin_Creator', 'Skin_Usage') or not isinstance(manifest['files'], dict) or not 1 <= len(manifest['files']) <= 2000:
        raise PackageError('Invalid release manifest')
    entries, seen = [], set()
    for name, expected in manifest['files'].items():
        relative = safe_relative(name)
        if name.casefold() in seen or name == 'release-manifest.json':
            raise PackageError('Duplicate/self-referential release path')
        seen.add(name.casefold())
        if not isinstance(expected, str) or len(expected) != 64 or any(c not in '0123456789abcdef' for c in expected):
            raise PackageError('Invalid release fingerprint')
        file = checked_file(root, relative)
        if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
            raise PackageError('Reviewed release file changed: ' + name)
        entries.append((name, file, expected))
    return manifest['package'], raw, entries


def build_zip(root, output):
    root = Path(root).resolve()
    package, manifest, entries = release_entries(root)
    output = Path(os.path.abspath(output))
    if output.is_relative_to(root) or output.suffix.casefold() != '.zip':
        raise PackageError('Write the ZIP outside its source package')
    for parent in (output, *output.parents):
        if parent.is_symlink() or (parent.exists() and getattr(parent.lstat(), 'st_file_attributes', 0) & 0x400):
            raise PackageError('ZIP output must not use links or reparse points')
    output.parent.mkdir(parents=True, exist_ok=True)
    stream = output.open('xb')
    created = os.fstat(stream.fileno())
    try:
        with stream, zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            def add(name, data):
                item = zipfile.ZipInfo(package + '/' + name, date_time=(1980, 1, 1, 0, 0, 0))
                item.compress_type = zipfile.ZIP_DEFLATED
                item.external_attr = 0o100644 << 16
                archive.writestr(item, data)
            add('release-manifest.json', manifest)
            for name, file, expected in entries:
                data = file.read_bytes()
                if hashlib.sha256(data).hexdigest() != expected:
                    raise PackageError('File changed while packaging: ' + name)
                add(name, data)
    except Exception:
        # Only the exact newly-created output is removed. Existing ZIPs are never overwritten.
        if output.is_file():
            current = output.stat(follow_symlinks=False)
            if (current.st_dev, current.st_ino) == (created.st_dev, created.st_ino):
                output.unlink()
        raise
    return {'output': str(output), 'package': package, 'files': len(entries) + 1}


def main(argv=None, root=None):
    parser = argparse.ArgumentParser(description='Build a clean standalone package ZIP / 按白名单打包独立 ZIP')
    parser.add_argument('--output', help='New ZIP path outside this package / 包目录外的新ZIP路径')
    parser.add_argument('--list', action='store_true', help='List reviewed files without building / 只显示发布清单')
    args = parser.parse_args(argv)
    root = Path(root) if root is not None else Path(__file__).resolve().parents[2]
    if args.list:
        package, _, entries = release_entries(root)
        print(json.dumps({'package': package, 'files': ['release-manifest.json', *(name for name, _, _ in entries)]}, ensure_ascii=False, indent=2))
        return 0
    if not args.output:
        parser.error('--output or --list is required')
    print(json.dumps(build_zip(root, args.output), ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (PackageError, OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

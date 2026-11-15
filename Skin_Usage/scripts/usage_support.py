"""Bounded local metadata only; no subprocess, network, UI or launcher mutation."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re


class UsageError(ValueError):
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code


def checked_path(file, root=None):
    file = Path(os.path.abspath(file))
    for part in (file, *file.parents):
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), 'st_file_attributes', 0) & 0x400):
            raise UsageError('unsafe_path', 'Links and reparse points are not supported')
    if root is not None and not file.is_relative_to(Path(root).resolve()):
        raise UsageError('unsafe_path', 'Path escapes the allowed directory')
    return file


def read_json(file, limit=32768, optional=False):
    file = checked_path(file)
    try:
        with file.open('rb') as stream:
            data = stream.read(limit + 1)
    except FileNotFoundError:
        if optional:
            return None
        raise UsageError('metadata_missing', 'Required local metadata is missing')
    if len(data) > limit:
        raise UsageError('metadata_limit', 'Local metadata exceeds its size limit')
    try:
        return json.loads(data.decode('utf-8-sig'))
    except (ValueError, UnicodeError) as error:
        raise UsageError('metadata_invalid', 'Invalid UTF-8 JSON metadata') from error


def snapshot(file, expected_revision, now):
    value = read_json(file, optional=True)
    if value is None:
        return {'available': False, 'liveVerified': False}
    if not isinstance(value, dict):
        raise UsageError('metadata_invalid', 'Expected a status object')
    age = None
    try:
        at = datetime.fromisoformat(value['at'].replace('Z', '+00:00'))
        if at.tzinfo is not None:
            age = round((now - at).total_seconds())
    except (KeyError, AttributeError, TypeError, ValueError):
        pass
    result = {'available': True, 'liveVerified': False, 'ageSeconds': age,
              'fresh': age is not None and 0 <= age <= 60}
    for key in ('state', 'clientVersion'):
        item = value.get(key)
        if isinstance(item, str) and len(item) <= 100:
            result[key] = item
    if isinstance(value.get('revision'), str):
        result['payloadMatches'] = value['revision'] == expected_revision
    # Never echo raw error messages, command lines, PID/browser IDs or log contents.
    return result


def status(root, state=None, full=False, now=None):
    root = checked_path(root)
    runtime = root / 'runtime'
    profile = read_json(runtime / 'runtime-profile.json')
    if profile != {'schemaVersion': 1, 'role': 'usage'} or type(profile.get('schemaVersion')) is not int:
        raise UsageError('metadata_invalid', 'Expected the bundled Usage runtime')
    registry = read_json(runtime / 'adapters/versions.json')
    profiles = registry.get('profiles') if isinstance(registry, dict) else None
    if not isinstance(registry, dict) or type(registry.get('schemaVersion')) is not int or registry['schemaVersion'] != 1 or not isinstance(profiles, dict) or not 1 <= len(profiles) <= 64 or any(not re.fullmatch(r'\d+(?:\.\d+){3}', k) for k in profiles):
        raise UsageError('metadata_invalid', 'Invalid exact-version registry')
    catalog = read_json(runtime / 'theme-catalog.json', optional=True)
    if catalog is not None and (not isinstance(catalog, dict) or type(catalog.get('schemaVersion')) is not int or catalog['schemaVersion'] != 1):
        raise UsageError('metadata_invalid', 'Invalid theme catalog version')
    ids = catalog.get('skinIds') if isinstance(catalog, dict) else ['kurumi-twilight', 'neutral-dark'] if catalog is None else None
    if not isinstance(ids, list) or not 1 <= len(ids) <= 16 or any(not isinstance(v, str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', v) for v in ids) or len(set(ids)) != len(ids):
        raise UsageError('metadata_invalid', 'Invalid theme catalog')
    themes = []
    for skin in ids:
        manifest = read_json(runtime / 'themes' / skin / 'manifest.json', 128 * 1024)
        if not isinstance(manifest, dict) or manifest.get('id') != skin or not isinstance(manifest.get('name'), str) or not 1 <= len(manifest['name']) <= 80:
            raise UsageError('metadata_invalid', 'Theme identity does not match its catalog entry')
        themes.append({'id': skin, 'name': manifest['name']})
    payload = read_json(runtime / 'dist/cdp-payload.json')
    revision = payload.get('revision') if isinstance(payload, dict) else None
    if not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{64}', revision):
        raise UsageError('metadata_invalid', 'Invalid payload revision')
    now = now or datetime.now(timezone.utc)
    routes = []
    for route, config_name, default_folder in [('legacy', 'launcher.json', 'CodexSkin'), ('python', 'launcher-python.json', 'CodexSkinPython')]:
        file = runtime / config_name
        config = read_json(file, optional=True)
        item = {'route': route, 'configured': config is not None}
        if config is not None:
            if not isinstance(config, dict) or set(config) - {'port', 'proxyMode', 'proxyServer', 'stateRoot'} or config.get('proxyMode') not in ('proxy', 'direct'):
                raise UsageError('configuration_invalid', 'Invalid launch configuration; use the existing configuration entrypoint')
            port = config.get('port', 9335)
            if type(port) is not int or not 1024 <= port <= 65535:
                raise UsageError('configuration_invalid', 'Invalid configured port')
            if config['proxyMode'] == 'proxy':
                address = config.get('proxyServer')
                match = re.fullmatch(r'127\.0\.0\.1:(\d{1,5})', address) if isinstance(address, str) else None
                if not match or not 1 <= int(match[1]) <= 65535:
                    raise UsageError('configuration_invalid', 'Expected a local HTTP proxy host and port')
            item.update(mode=config['proxyMode'], port=port)
            state_root = config.get('stateRoot')
            if state_root is not None and (not isinstance(state_root, str) or not state_root):
                raise UsageError('configuration_invalid', 'Invalid configured state path')
            if not state_root and os.environ.get('LOCALAPPDATA'):
                state_root = str(Path(os.environ['LOCALAPPDATA']) / default_folder)
            if state_root:
                state_root = Path(state_root)
                if not state_root.is_absolute():
                    state_root = runtime / state_root
                state_root = checked_path(state_root)
                item['snapshot'] = snapshot(state_root / 'status.json', revision, now)
                if full:
                    item['stateRoot'] = str(state_root)
        if full:
            item['configurationFile'] = str(file)
        routes.append(item)
    result = {'package': 'Skin_Usage', 'themes': themes if full else ids,
              'supportedClients': list(profiles), 'routes': routes,
              'scope': 'disk-metadata-only', 'liveVerified': False}
    if state:
        file = checked_path(state)
        if file.name != 'session.json' or not file.is_file():
            raise UsageError('state_missing', 'Pass the existing managed session.json explicitly')
        result['selectedSnapshot'] = snapshot(file.parent / 'status.json', revision, now)
    if full:
        result['payload'] = {'revision': revision, 'bytes': payload.get('bytes')}
        result['packageRoot'] = str(root)
    return result


def main(argv=None, root=None):
    root = Path(root or Path(__file__).resolve().parents[1])
    parser = argparse.ArgumentParser(description='Compact Skin metadata / 简短皮肤状态与按需纠错')
    parser.add_argument('action', nargs='?', default='status', choices=['status', 'recovery', 'record'])
    parser.add_argument('--format', choices=['brief', 'full'], default='brief')
    parser.add_argument('--language', default='en')
    parser.add_argument('--state')
    parser.add_argument('--query')
    parser.add_argument('--input')
    parser.add_argument('--evidence-root')
    args = parser.parse_args(argv)
    try:
        if args.action == 'status':
            result = status(root, args.state, args.format == 'full')
        else:
            # Neither the catalog nor history is imported/read on normal status calls.
            from usage_recovery import lookup, record
            if args.action == 'recovery':
                result = lookup(root, args.query, args.language)
            else:
                if not args.input or not args.evidence_root:
                    raise UsageError('record_input', 'Supply --input JSON and --evidence-root within this package work/ or .local/')
                result = record(root, args.evidence_root, read_json(args.input))
    except (UsageError, OSError, ValueError) as error:
        result = {'error': getattr(error, 'code', 'local_io_error'), 'message': str(error)[:400]}
        if args.action == 'status':
            try:
                from usage_recovery import lookup
                result['recovery'] = lookup(root, result['error'], args.language)
            except (UsageError, OSError, ValueError):
                pass  # Preserve the original failure and nonzero exit.
        print(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.format == 'full' else None,
                     separators=None if args.format == 'full' else (',', ':')))
    return 0

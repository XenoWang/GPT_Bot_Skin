"""On-demand data lookup and append-only evidence records. Never executes fixes."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import time
import uuid
import os
from usage_support import UsageError, checked_path, read_json

ID = re.compile(r'[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,12}')


def valid_id(value):
    return isinstance(value, str) and len(value) <= 100 and ID.fullmatch(value) is not None


def history(root):
    directory = checked_path(Path(root) / '.local/recovery', root)
    if not directory.exists():
        return []
    files = sorted(p for p in directory.iterdir() if re.fullmatch(r'\d{13}-[a-f0-9-]{36}\.json', p.name))
    if len(files) > 2000:
        raise UsageError('history_limit', 'Archive recovery history before adding more records')
    records = []
    for file in files:
        entry = read_json(file)
        if not isinstance(entry, dict) or not valid_id(entry.get('id')) or entry.get('status') not in ('observed', 'resolved', 'reopened'):
            raise UsageError('record_invalid', 'Invalid recovery history')
        if any(not isinstance(entry.get(k), str) or len(entry[k]) > 2000 for k in ('symptom', 'resolution', 'verification')) or not isinstance(entry.get('keywords'), list) or len(entry['keywords']) > 12 or any(not isinstance(t, str) or not t or len(t) > 120 for t in entry['keywords']):
            raise UsageError('record_invalid', 'Invalid recovery history text')
        try:
            timestamp = datetime.fromisoformat(entry['at'])
            if timestamp.tzinfo is None:
                raise ValueError('Timezone required')
        except (KeyError, TypeError, ValueError) as error:
            raise UsageError('record_invalid', 'Invalid recovery timestamp') from error
        records.append(entry)
    # Several writes may share a millisecond filename prefix. UUID lexical order
    # is not chronology; use the recorded full timestamp to choose the latest.
    return sorted(records, key=lambda entry: datetime.fromisoformat(entry['at']))


def lookup(root, query, language='en'):
    if not isinstance(query, str) or not query.strip() or len(query) > 500:
        raise UsageError('query_invalid', 'Supply a nonempty recovery query up to 500 characters')
    data = read_json(Path(root) / 'references/recovery-cases.json', 128 * 1024)
    if not isinstance(data, dict) or type(data.get('schemaVersion')) is not int or data['schemaVersion'] != 1 or not isinstance(data.get('cases'), list) or len(data['cases']) > 100:
        raise UsageError('catalog_invalid', 'Invalid recovery catalog')
    records, matches, q = history(root), [], query.casefold()
    for item in data['cases']:
        if not isinstance(item, dict) or not valid_id(item.get('id')) or item.get('status') not in ('verified-fix', 'unresolved') or not isinstance(item.get('terms'), list) or len(item['terms']) > 20 or any(not isinstance(t, str) or not t or len(t) > 120 for t in item['terms']):
            raise UsageError('catalog_invalid', 'Invalid recovery case')
        score = 100 if q == item['id'].casefold() else sum(term.casefold() in q for term in item['terms'])
        if not score:
            continue
        locales = item.get('locales', {})
        if not isinstance(locales, dict):
            raise UsageError('catalog_invalid', 'Invalid recovery languages')
        base = locales.get('en')
        chosen = locales.get(language, {})
        if not isinstance(base, dict) or not isinstance(chosen, dict):
            raise UsageError('catalog_invalid', 'Recovery cases require English fallback text')
        text = {**base, **chosen}
        if any(not isinstance(text.get(k), str) or not text[k] or len(text[k]) > 2000 for k in ('title', 'symptom', 'action', 'verify')):
            raise UsageError('catalog_invalid', 'Invalid recovery text')
        previous = [r for r in records if r['id'] == item['id']]
        matches.append({'id': item['id'], 'score': score, 'status': item.get('status', 'observed'),
                        **{k: text[k] for k in ('title', 'symptom', 'action', 'verify')},
                        'historyCount': len(previous), **({'lastRecord': {k: previous[-1].get(k) for k in ('status', 'resolution', 'verification')}} if previous else {})})
    for last in reversed(records):
        if any(m['id'] == last['id'] for m in matches):
            continue
        if q == last['id'].casefold() or any(isinstance(term, str) and term.casefold() in q for term in last.get('keywords', [])):
            matches.append({'id': last['id'], 'score': 1, 'status': last['status'], 'title': last['symptom'], 'action': last['resolution'], 'verify': last['verification'], 'historyCount': sum(r['id'] == last['id'] for r in records)})
    matches.sort(key=lambda m: (-m['score'], m['id']))
    return {'matches': matches[:3], 'matchedCount': len(matches), 'automaticActions': False}


def record(root, evidence_root, entry):
    root = checked_path(root).resolve()
    evidence_root = checked_path(evidence_root, root)
    if not any(evidence_root.is_relative_to(root / folder) for folder in ('work', '.local')) or not evidence_root.is_dir():
        raise UsageError('unsafe_path', 'Keep evidence under this package work/ or .local/')
    allowed = {'id', 'status', 'symptom', 'resolution', 'verification', 'keywords', 'evidence'}
    if not isinstance(entry, dict) or set(entry) != allowed or not valid_id(entry.get('id')) or entry['status'] not in ('observed', 'resolved', 'reopened'):
        raise UsageError('record_invalid', 'Invalid recovery record')
    for key in ('symptom', 'resolution', 'verification'):
        if not isinstance(entry[key], str) or len(entry[key]) > 2000:
            raise UsageError('record_invalid', 'Invalid recovery description')
    if not entry['symptom'].strip() or not isinstance(entry['keywords'], list) or len(entry['keywords']) > 12 or any(not isinstance(t, str) or not t.strip() or len(t) > 120 for t in entry['keywords']) or not isinstance(entry['evidence'], list) or len(entry['evidence']) > 5:
        raise UsageError('record_invalid', 'Invalid keywords or evidence list')
    if entry['status'] == 'resolved' and (not entry['resolution'].strip() or not entry['verification'].strip() or not entry['evidence']):
        raise UsageError('verification_required', 'Resolved records require the actual fix, verification and existing evidence')
    evidence = []
    for name in entry['evidence']:
        if not isinstance(name, str) or len(name) > 240 or re.search(r'[\\:\x00-\x1f<>"|?*]', name) or any(p in ('', '.', '..') for p in name.split('/')):
            raise UsageError('unsafe_path', 'Evidence must be a safe relative path')
        file = checked_path(evidence_root / name, evidence_root)
        if not file.is_file() or file.stat().st_size > 20 * 1024 * 1024:
            raise UsageError('evidence_invalid', 'Evidence is missing or exceeds 20 MiB')
        data = file.read_bytes()
        if entry['status'] == 'resolved' and file.suffix.lower() == '.json':
            parsed = json.loads(data.decode('utf-8-sig'))
            if isinstance(parsed, dict) and (parsed.get('passed') is False or parsed.get('status') in ('FAIL', 'BLOCKED', 'INCONCLUSIVE') or parsed.get('exitCode', 0) != 0):
                raise UsageError('failed_evidence', 'Failed or inconclusive evidence cannot resolve a record')
        evidence.append({'file': name, 'sha256': hashlib.sha256(data).hexdigest()})
    # Read/validate existing history first; old failed attempts are never replaced.
    if len(history(root)) >= 2000:
        raise UsageError('history_limit', 'Archive recovery history before adding more records')
    directory = checked_path(root / '.local/recovery', root)
    directory.mkdir(parents=True, exist_ok=True)
    checked_path(directory, root)
    output = directory / (str(time.time_ns() // 1_000_000) + '-' + str(uuid.uuid4()) + '.json')
    if output.exists():
        raise UsageError('record_exists', 'An existing recovery record cannot be replaced')
    saved = {**entry, 'evidence': evidence, 'evidenceRoot': evidence_root.relative_to(root).as_posix(), 'at': datetime.now(timezone.utc).isoformat()}
    temporary = directory / ('.' + str(uuid.uuid4()) + '.tmp')
    try:
        with temporary.open('x', encoding='utf-8') as stream:
            json.dump(saved, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        # Hard-link creation is atomic and refuses an existing destination.
        # The temporary name is excluded from history scans until the full write.
        os.link(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    return {'id': entry['id'], 'status': entry['status'], 'record': output.relative_to(root).as_posix(), 'evidenceCount': len(evidence), 'grantsPermission': False}

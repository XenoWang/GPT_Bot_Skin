"""Usage-only metadata/recovery contracts; synthetic files, no live client access."""
import builtins
from contextlib import redirect_stdout
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
import uuid

sys.dont_write_bytecode = True
RUNTIME = Path(__file__).resolve().parents[1]
USAGE = RUNTIME.parent.parent / 'Skin_Usage'
sys.path.insert(0, str(USAGE / 'scripts'))
import usage_support as support
import usage_recovery as recovery


class UsageSupport(unittest.TestCase):
    def setUp(self):
        work = RUNTIME / 'work/usage-support-tests'
        work.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='support-', dir=work)
        self.root = Path(self.temp.name).resolve()
        self.assertTrue(self.root.is_relative_to(work.resolve()))
        self.write('runtime/runtime-profile.json', {'schemaVersion': 1, 'role': 'usage'})
        self.write('runtime/adapters/versions.json', {'schemaVersion': 1, 'profiles': {'26.1111.2228.0': '26.1111'}})
        self.write('runtime/theme-catalog.json', {'schemaVersion': 1, 'skinIds': ['sample-one', 'sample-two']})
        for key in ['sample-one', 'sample-two']:
            self.write('runtime/themes/' + key + '/manifest.json', {'id': key, 'name': 'Example ' + key})
        self.write('runtime/dist/cdp-payload.json', {'revision': 'a' * 64, 'bytes': 12345})
        self.write('runtime/launcher.json', {'port': 9335, 'proxyMode': 'direct', 'proxyServer': '', 'stateRoot': 'fixture-state'})
        self.write('runtime/fixture-state/status.json', {'state': 'active', 'at': '2026-11-15T12:00:00Z', 'revision': 'a' * 64, 'clientVersion': '26.1111.2228.0', 'ownerPid': 98765, 'browserId': 'private-marker', 'error': 'private-marker'})
        (self.root / 'references').mkdir()
        shutil.copyfile(USAGE / 'references/recovery-cases.json', self.root / 'references/recovery-cases.json')
        self.now = datetime(2026, 11, 15, 12, 0, 30, tzinfo=timezone.utc)

    def tearDown(self):
        self.temp.cleanup()

    def write(self, name, data):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data), encoding='utf-8')
        return p

    def test_normal_summary_reads_no_recovery_and_starts_no_process_or_network(self):
        before = {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        original_import = builtins.__import__
        def imported(name, *args, **kwargs):
            if name == 'usage_recovery':
                self.fail('Normal status must not load recovery')
            return original_import(name, *args, **kwargs)
        with patch('builtins.__import__', side_effect=imported), patch('subprocess.Popen', side_effect=AssertionError('No process')), patch('socket.create_connection', side_effect=AssertionError('No network')):
            out = io.StringIO()
            with redirect_stdout(out):
                self.assertEqual(support.main(['status'], root=self.root), 0)
        data = json.loads(out.getvalue())
        self.assertEqual(data['themes'], ['sample-one', 'sample-two'])
        self.assertEqual(data['scope'], 'disk-metadata-only')
        self.assertFalse(data['liveVerified'])
        self.assertFalse(data['routes'][1]['configured'])
        self.assertNotIn(str(self.root), out.getvalue())
        self.assertNotIn('private-marker', out.getvalue())
        self.assertEqual(before, {p.relative_to(self.root): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})
        self.assertFalse((self.root / '.local').exists())

    def test_snapshot_age_and_payload_match_never_imply_live_verification(self):
        result = support.status(self.root, now=self.now)
        snap = result['routes'][0]['snapshot']
        self.assertEqual(snap['ageSeconds'], 30)
        self.assertTrue(snap['fresh'])
        self.assertTrue(snap['payloadMatches'])
        self.assertFalse(snap['liveVerified'])
        for stamp, fresh, age in [('2026-11-15T11:59:29Z', False, 61), ('2026-11-15T12:00:40Z', False, -10), ('unknown', False, None)]:
            file = self.write('runtime/fixture-state/status.json', {'at': stamp, 'state': 'active', 'revision': 'b' * 64})
            snap = support.snapshot(file, 'a' * 64, self.now)
            self.assertEqual(snap['fresh'], fresh)
            self.assertEqual(snap['ageSeconds'], age)
            self.assertFalse(snap['payloadMatches'])
            self.assertFalse(snap['liveVerified'])

    def test_brief_full_output_share_decisions_and_explicit_state_is_metadata_only(self):
        session = self.write('work/explicit/session.json', {'browserId': 'must-not-be-read'})
        self.write('work/explicit/status.json', {'at': '2026-11-15T12:00:00Z', 'state': 'stopped'})
        brief = support.status(self.root, str(session), now=self.now)
        full = support.status(self.root, str(session), True, self.now)
        self.assertEqual(brief['themes'], [r['id'] for r in full['themes']])
        self.assertEqual(brief['supportedClients'], full['supportedClients'])
        self.assertEqual(brief['selectedSnapshot']['state'], 'stopped')
        self.assertFalse(brief['selectedSnapshot']['liveVerified'])
        self.assertNotIn('packageRoot', brief)
        self.assertEqual(full['packageRoot'], str(self.root))
        self.assertLess(len(json.dumps(brief)), len(json.dumps(full)))

    def test_invalid_paths_metadata_and_limits_fail_without_mutating_files(self):
        self.write('runtime/theme-catalog.json', {'schemaVersion': 1, 'skinIds': ['../outside']})
        with self.assertRaises(support.UsageError):
            support.status(self.root)
        self.write('runtime/theme-catalog.json', {'schemaVersion': True, 'skinIds': ['sample-one']})
        with self.assertRaises(support.UsageError):
            support.status(self.root)
        file = self.root / 'oversized.json'
        file.write_bytes(b' ' * 32769)
        with self.assertRaisesRegex(support.UsageError, 'size limit'):
            support.read_json(file)
        with self.assertRaises(support.UsageError):
            support.checked_path(self.root.parent, self.root)
        with patch.object(Path, 'is_symlink', return_value=True), self.assertRaises(support.UsageError):
            support.checked_path(self.root / 'link')

    def test_original_status_error_stays_nonzero_when_recovery_catalog_is_broken(self):
        self.write('runtime/runtime-profile.json', {'schemaVersion': 1, 'role': 'creator'})
        self.write('references/recovery-cases.json', [])
        out = io.StringIO()
        with redirect_stdout(out):
            code = support.main(['status'], root=self.root)
        self.assertEqual(code, 1)
        self.assertEqual(json.loads(out.getvalue())['error'], 'metadata_invalid')
        self.assertNotIn('Traceback', out.getvalue())

    def test_recovery_is_bounded_localized_and_keeps_unresolved_causes(self):
        footer = recovery.lookup(self.root, '底部黑影', 'zh-CN')
        self.assertEqual([m['id'] for m in footer['matches']], ['SKIN-CHAT-FOOTER-MASK-001'])
        self.assertEqual(footer['matches'][0]['title'], '原生页脚遮挡底图')
        self.assertFalse(footer['automaticActions'])
        many = recovery.lookup(self.root, 'titlebar footer popover client version', 'en')
        self.assertEqual(len(many['matches']), 3)
        self.assertEqual(many['matchedCount'], 4)
        search = recovery.lookup(self.root, 'Thread context is unavailable', 'en')
        self.assertEqual(search['matches'][0]['status'], 'unresolved')
        file = self.root / 'references/recovery-cases.json'
        data = json.loads(file.read_text(encoding='utf-8'))
        case = next(c for c in data['cases'] if c['id'] == 'SKIN-CHAT-FOOTER-MASK-001')
        case['locales']['fr'] = {'title': 'Synthetic translated title'}
        file.write_text(json.dumps(data), encoding='utf-8')
        french = recovery.lookup(self.root, 'footer', 'fr')['matches'][0]
        self.assertEqual(french['title'], 'Synthetic translated title')
        self.assertEqual(french['action'], case['locales']['en']['action'])

    def example_record(self, status='observed'):
        return {'id': 'LOCAL-RECOVERY-001', 'status': status, 'symptom': 'Synthetic local issue', 'resolution': 'Scoped synthetic fix', 'verification': 'Synthetic fixture only', 'keywords': ['local-demo'], 'evidence': ['proof.json']}

    def test_records_append_evidence_hashes_and_preserve_failed_attempt_history(self):
        proof = self.write('work/evidence/proof.json', {'passed': True})
        evidence_root = proof.parent
        first = recovery.record(self.root, evidence_root, self.example_record())
        original = (self.root / first['record']).read_bytes()
        recovery.record(self.root, evidence_root, self.example_record('resolved'))
        recovery.record(self.root, evidence_root, self.example_record('reopened'))
        self.assertEqual((self.root / first['record']).read_bytes(), original)
        records = recovery.history(self.root)
        self.assertEqual([r['status'] for r in records], ['observed', 'resolved', 'reopened'])
        self.assertEqual(records[1]['evidence'][0]['sha256'], hashlib.sha256(proof.read_bytes()).hexdigest())
        last = recovery.lookup(self.root, 'local-demo')['matches'][0]
        self.assertEqual(last['historyCount'], 3)
        self.assertEqual(last['status'], 'reopened')
        self.assertFalse(first['grantsPermission'])
        self.assertFalse(list((self.root / '.local/recovery').glob('*.tmp')))

    def test_failed_missing_or_escaping_evidence_cannot_resolve_or_overwrite(self):
        proof = self.write('work/evidence/proof.json', {'passed': False})
        for data in [{'passed': False}, {'exitCode': 1}, {'status': 'INCONCLUSIVE'}]:
            proof.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaises(support.UsageError):
                recovery.record(self.root, proof.parent, self.example_record('resolved'))
        self.assertEqual(recovery.history(self.root), [])
        bad = self.example_record('resolved')
        for name in ['../outside.json', '/outside.json', 'C:/outside.json']:
            bad['evidence'] = [name]
            with self.assertRaises(support.UsageError):
                recovery.record(self.root, proof.parent, bad)
        bad['evidence'] = []
        with self.assertRaises(support.UsageError):
            recovery.record(self.root, proof.parent, bad)
        proof.write_text('{"passed":true}', encoding='utf-8')
        fixed = uuid.UUID('11111111-1111-4111-8111-111111111111')
        with patch.object(recovery.time, 'time_ns', return_value=1794744000000000000), patch.object(recovery.uuid, 'uuid4', return_value=fixed):
            first = recovery.record(self.root, proof.parent, self.example_record('resolved'))
            original = (self.root / first['record']).read_bytes()
            with self.assertRaises(support.UsageError):
                recovery.record(self.root, proof.parent, self.example_record('resolved'))
            self.assertEqual((self.root / first['record']).read_bytes(), original)

    def test_history_uses_full_timestamp_when_uuid_filename_order_is_reversed(self):
        earlier = {**self.example_record('observed'), 'at': '2026-11-15T12:00:00.000001+00:00'}
        later = {**self.example_record('resolved'), 'at': '2026-11-15T12:00:00.000002+00:00'}
        self.write('.local/recovery/1794744000000-ffffffff-ffff-4fff-8fff-ffffffffffff.json', earlier)
        self.write('.local/recovery/1794744000000-11111111-1111-4111-8111-111111111111.json', later)
        self.assertEqual([r['status'] for r in recovery.history(self.root)], ['observed', 'resolved'])
        result = recovery.lookup(self.root, 'local-demo')['matches'][0]
        self.assertEqual(result['status'], 'resolved')
        self.assertEqual(result['historyCount'], 2)


if __name__ == '__main__':
    unittest.main()

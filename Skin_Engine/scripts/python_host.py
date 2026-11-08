"""Windows host services for the opt-in Python chain; no shell or PowerShell.

Sources: Microsoft appmodel.h package query APIs and GetExtendedTcpTable.
All identity failures are fatal; this module never changes OS security settings.
"""
from contextlib import contextmanager
import ctypes as C
from ctypes import wintypes as W
import datetime as DT
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import struct


class HostError(RuntimeError):
    pass


def reject_links(path):
    path = Path(os.path.abspath(os.fspath(path)))
    if str(path).startswith(('\\\\?\\', '\\\\.\\')):
        raise HostError('Runtime paths must use ordinary filesystem paths')
    for item in (path, *path.parents):
        if item.exists() or item.is_symlink():
            info = item.lstat()
            if item.is_symlink() or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise HostError('Runtime paths must not use symlinks or reparse points')
    return path


def read_json(path, maximum=32768):
    path = reject_links(path)
    data = path.read_bytes()
    if len(data) > maximum:
        raise HostError('JSON file exceeds the permitted size')
    value = json.loads(data.decode('utf-8-sig'))
    if not isinstance(value, dict):
        raise HostError('Expected a JSON object')
    return value


def filetime_text(ticks):
    seconds, fraction = divmod(int(ticks), 10_000_000)
    value = DT.datetime(1601, 1, 1, tzinfo=DT.timezone.utc) + DT.timedelta(seconds=seconds)
    return value.strftime('%Y-%m-%dT%H:%M:%S') + f'.{fraction:07d}Z'


class PROCESSENTRY32W(C.Structure):
    _fields_ = [('dwSize', W.DWORD), ('cntUsage', W.DWORD), ('th32ProcessID', W.DWORD),
                ('th32DefaultHeapID', C.c_size_t), ('th32ModuleID', W.DWORD),
                ('cntThreads', W.DWORD), ('th32ParentProcessID', W.DWORD),
                ('pcPriClassBase', W.LONG), ('dwFlags', W.DWORD), ('szExeFile', W.WCHAR * 260)]


class TCP4(C.Structure):
    _fields_ = [(key, W.DWORD) for key in ('state', 'address', 'port', 'remote', 'remote_port', 'pid')]


class TCP6(C.Structure):
    _fields_ = [('address', C.c_ubyte * 16), ('scope', W.DWORD), ('port', W.DWORD),
                ('remote', C.c_ubyte * 16), ('remote_scope', W.DWORD), ('remote_port', W.DWORD),
                ('state', W.DWORD), ('pid', W.DWORD)]


class WindowsHost:
    def __init__(self):
        if os.name != 'nt':
            raise HostError('The Skin runtime requires Windows')
        self.kernel = C.WinDLL('kernel32', use_last_error=True, winmode=0x800)
        self.base = C.WinDLL('kernelbase', use_last_error=True, winmode=0x800)
        self.ip = C.WinDLL('iphlpapi', use_last_error=True, winmode=0x800)
        self.advapi = C.WinDLL('advapi32', use_last_error=True, winmode=0x800)
        pd = C.POINTER(W.DWORD)
        self.fn(self.kernel, 'OpenProcess', [W.DWORD, W.BOOL, W.DWORD], W.HANDLE)
        self.fn(self.kernel, 'CloseHandle', [W.HANDLE], W.BOOL)
        self.fn(self.kernel, 'QueryFullProcessImageNameW', [W.HANDLE, W.DWORD, W.LPWSTR, pd], W.BOOL)
        self.fn(self.kernel, 'GetProcessTimes', [W.HANDLE] + [C.POINTER(W.FILETIME)] * 4, W.BOOL)
        self.fn(self.kernel, 'GetExitCodeProcess', [W.HANDLE, pd], W.BOOL)
        self.fn(self.kernel, 'GetPackageFullName', [W.HANDLE, pd, W.LPWSTR], W.LONG)
        self.fn(self.kernel, 'GetPackagePathByFullName', [W.LPCWSTR, pd, W.LPWSTR], W.LONG)
        self.fn(self.kernel, 'FindPackagesByPackageFamily', [W.LPCWSTR, W.DWORD, pd, C.POINTER(W.LPWSTR), pd, W.LPWSTR, pd], W.LONG)
        self.fn(self.base, 'GetStagedPackageOrigin', [W.LPCWSTR, C.POINTER(C.c_int)], W.LONG)
        self.fn(self.kernel, 'CreateToolhelp32Snapshot', [W.DWORD, W.DWORD], W.HANDLE)
        self.fn(self.kernel, 'Process32FirstW', [W.HANDLE, C.POINTER(PROCESSENTRY32W)], W.BOOL)
        self.fn(self.kernel, 'Process32NextW', [W.HANDLE, C.POINTER(PROCESSENTRY32W)], W.BOOL)
        self.fn(self.ip, 'GetExtendedTcpTable', [C.c_void_p, pd, W.BOOL, W.DWORD, C.c_int, W.DWORD], W.DWORD)
        self.fn(self.kernel, 'CreateMutexW', [C.c_void_p, W.BOOL, W.LPCWSTR], W.HANDLE)
        self.fn(self.kernel, 'WaitForSingleObject', [W.HANDLE, W.DWORD], W.DWORD)
        self.fn(self.kernel, 'ReleaseMutex', [W.HANDLE], W.BOOL)
        self.fn(self.kernel, 'GetCurrentProcess', [], W.HANDLE)
        self.fn(self.advapi, 'OpenProcessToken', [W.HANDLE, W.DWORD, C.POINTER(W.HANDLE)], W.BOOL)
        self.fn(self.advapi, 'GetTokenInformation', [W.HANDLE, C.c_int, C.c_void_p, W.DWORD, pd], W.BOOL)
        self.fn(self.advapi, 'ConvertSidToStringSidW', [C.c_void_p, C.POINTER(W.LPWSTR)], W.BOOL)
        self.fn(self.kernel, 'LocalFree', [C.c_void_p], C.c_void_p)

    @staticmethod
    def fn(dll, name, arguments, result):
        fn = getattr(dll, name)
        fn.argtypes, fn.restype = arguments, result
        return fn

    @staticmethod
    def checked(ok, label):
        if not ok:
            raise HostError(f'{label}: Windows error {C.get_last_error()}')

    def wide(self, fn, argument):
        size = W.DWORD()
        result = fn(argument, C.byref(size), None)
        if result not in (0, 122) or not 0 < size.value <= 32768:
            raise HostError(f'Package identity query failed: {result}')
        buffer = C.create_unicode_buffer(size.value)
        result = fn(argument, C.byref(size), buffer)
        if result:
            raise HostError(f'Package identity query failed: {result}')
        return buffer.value

    def process(self, pid, include_package=False):
        if type(pid) is not int or pid <= 0:
            raise HostError('Invalid process ID')
        handle = self.kernel.OpenProcess(0x1000, False, pid)
        if not handle and C.get_last_error() == 87:
            raise ProcessLookupError(pid)
        self.checked(handle, 'OpenProcess')
        try:
            exit_code = W.DWORD()
            self.checked(self.kernel.GetExitCodeProcess(handle, C.byref(exit_code)), 'Process state')
            if exit_code.value != 259:
                raise ProcessLookupError(pid)
            size = W.DWORD(32768)
            name = C.create_unicode_buffer(size.value)
            self.checked(self.kernel.QueryFullProcessImageNameW(handle, 0, name, C.byref(size)), 'Process path')
            times = [W.FILETIME() for _ in range(4)]
            self.checked(self.kernel.GetProcessTimes(handle, *(C.byref(t) for t in times)), 'Process start time')
            started = (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
            result = {'pid': pid, 'exe': name.value, 'startedTicks': str(started)}
            if include_package:
                result['packageFullName'] = self.wide(self.kernel.GetPackageFullName, handle)
            return result
        finally:
            self.kernel.CloseHandle(handle)

    def processes(self, executable):
        snapshot = self.kernel.CreateToolhelp32Snapshot(2, 0)
        if snapshot == C.c_void_p(-1).value:
            raise HostError('Cannot enumerate client processes')
        result, entry = [], PROCESSENTRY32W()
        entry.dwSize = C.sizeof(entry)
        try:
            success = self.kernel.Process32FirstW(snapshot, C.byref(entry))
            while success:
                if entry.szExeFile.casefold() == Path(executable).name.casefold():
                    try:
                        info = self.process(entry.th32ProcessID)
                    except ProcessLookupError:
                        success = self.kernel.Process32NextW(snapshot, C.byref(entry))
                        continue
                    if os.path.normcase(info['exe']) == os.path.normcase(str(executable)):
                        result.append(info)
                success = self.kernel.Process32NextW(snapshot, C.byref(entry))
            if C.get_last_error() not in (0, 18):
                raise HostError('Process enumeration was incomplete')
            return result
        finally:
            self.kernel.CloseHandle(snapshot)

    def families(self):
        import winreg
        # Registry names are discovery hints only. Every candidate is checked by native APIs.
        base = r'Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository'
        found = set()
        for leaf in ('Families', 'Packages'):
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, base + '\\' + leaf) as key:
                    for i in range(winreg.QueryInfoKey(key)[0]):
                        name = winreg.EnumKey(key, i)
                        if name.startswith('OpenAI.Codex_'):
                            parts = name.split('_')
                            family = name if leaf == 'Families' else parts[0] + '_' + parts[-1]
                            if re.fullmatch(r'OpenAI\.Codex_[a-z0-9]{13}', family, re.I):
                                found.add(family)
            except FileNotFoundError:
                continue
        return sorted(found)

    def packages(self, family):
        if not re.fullmatch(r'OpenAI\.Codex_[a-z0-9]{13}', family, re.I):
            raise HostError('Unexpected package family')
        count, length = W.DWORD(), W.DWORD()
        fn = self.kernel.FindPackagesByPackageFamily
        result = fn(family, 0x10, C.byref(count), None, C.byref(length), None, None)
        if result not in (0, 122) or count.value > 64 or length.value > 65536:
            raise HostError(f'Package enumeration failed: {result}')
        if not count.value:
            return []
        names, properties = (W.LPWSTR * count.value)(), (W.DWORD * count.value)()
        buffer = C.create_unicode_buffer(length.value)
        result = fn(family, 0x10, C.byref(count), names, C.byref(length), buffer, properties)
        if result:
            raise HostError(f'Package enumeration failed: {result}')
        packages = []
        for i in range(count.value):
            full = names[i]
            match = re.fullmatch(r'OpenAI\.Codex_(\d+\.\d+\.\d+\.\d+)_(?:x64|x86|arm64|neutral)__[a-z0-9]{13}', full, re.I)
            origin = C.c_int()
            result = self.base.GetStagedPackageOrigin(full, C.byref(origin))
            if result:
                raise HostError(f'Package origin query failed: {result}')
            if not match or properties[i] & 0x10000 or origin.value != 3:
                continue
            folder = Path(self.wide(self.kernel.GetPackagePathByFullName, full))
            exe = folder / 'app' / 'ChatGPT.exe'
            if not exe.is_file():
                continue
            packages.append({'packageFullName': full, 'exe': str(exe), 'version': tuple(map(int, match[1].split('.'))), 'origin': 'store', 'development': False})
        return packages

    def package(self, fullname=None, family=None):
        if fullname:
            parts = fullname.split('_')
            if len(parts) != 5:
                raise HostError('Invalid package identity')
            families = [parts[0] + '_' + parts[-1]]
        else:
            families = [family] if family else self.families()
        packages = [p for f in families for p in self.packages(f) if not fullname or p['packageFullName'] == fullname]
        if not packages:
            raise HostError('Official registered Store Codex package not found; no security fallback is used')
        return max(packages, key=lambda p: p['version'])

    def listeners(self, port):
        rows = []
        for family, row_type in ((2, TCP4), (23, TCP6)):
            length = W.DWORD()
            result = self.ip.GetExtendedTcpTable(None, C.byref(length), False, family, 3, 0)
            if result not in (0, 122):
                raise HostError(f'TCP ownership query failed: {result}')
            for _ in range(3):
                if not 4 <= length.value <= 16 * 1024 * 1024:
                    raise HostError('Invalid TCP ownership buffer')
                buffer = C.create_string_buffer(length.value)
                result = self.ip.GetExtendedTcpTable(buffer, C.byref(length), False, family, 3, 0)
                if result != 122:
                    break
            if result:
                raise HostError(f'TCP ownership query failed: {result}')
            count = W.DWORD.from_buffer(buffer).value
            if 4 + count * C.sizeof(row_type) > len(buffer):
                raise HostError('Truncated TCP ownership table')
            for i in range(count):
                row = row_type.from_buffer(buffer, 4 + i * C.sizeof(row_type))
                if row.state == 2 and socket.ntohs(row.port & 0xffff) == port:
                    address = socket.inet_ntoa(struct.pack('=I', row.address)) if family == 2 else socket.inet_ntop(socket.AF_INET6, bytes(row.address))
                    rows.append({'address': address, 'pid': row.pid})
        return rows

    def user_sid(self):
        token = W.HANDLE()
        self.checked(self.advapi.OpenProcessToken(self.kernel.GetCurrentProcess(), 8, C.byref(token)), 'User identity')
        try:
            size = W.DWORD()
            self.advapi.GetTokenInformation(token, 1, None, 0, C.byref(size))
            if not 0 < size.value <= 65536:
                raise HostError('Invalid user identity buffer')
            buffer = C.create_string_buffer(size.value)
            self.checked(self.advapi.GetTokenInformation(token, 1, buffer, size, C.byref(size)), 'User identity')
            sid, text = C.c_void_p.from_buffer(buffer), W.LPWSTR()
            self.checked(self.advapi.ConvertSidToStringSidW(sid, C.byref(text)), 'User identity')
            try:
                return text.value
            finally:
                self.kernel.LocalFree(C.cast(text, C.c_void_p))
        finally:
            self.kernel.CloseHandle(token)

    def wait_for_exit(self, process, timeout):
        handle = self.kernel.OpenProcess(0x1000 | 0x100000, False, process['pid'])
        if not handle and C.get_last_error() == 87:
            return
        self.checked(handle, 'Wait for companion exit')
        try:
            try:
                current = self.process(process['pid'])
            except ProcessLookupError:
                return
            if current['startedTicks'] != process['startedTicks'] or os.path.normcase(current['exe']) != os.path.normcase(process['exe']):
                raise HostError('Companion identity changed')
            if self.kernel.WaitForSingleObject(handle, int(timeout * 1000)) != 0:
                raise HostError('Companion did not exit within the timeout')
        finally:
            self.kernel.CloseHandle(handle)

    @contextmanager
    def launch_lock(self):
        handle = self.kernel.CreateMutexW(None, False, 'Local\\CodexAppearance.' + self.user_sid())
        self.checked(handle, 'Launch lock')
        acquired = False
        try:
            result = self.kernel.WaitForSingleObject(handle, 0)
            if result not in (0, 0x80):
                raise HostError('Another Skin launcher is active')
            acquired = True
            yield
        finally:
            if acquired:
                self.kernel.ReleaseMutex(handle)
            self.kernel.CloseHandle(handle)


def assert_owner(state, host):
    if type(state.get('port')) is not int or not 1024 <= state['port'] <= 65535:
        raise HostError('Invalid CDP port')
    if not isinstance(state.get('packageFullName'), str) or not isinstance(state.get('exe'), str):
        raise HostError('Missing official package identity')
    package = host.package(fullname=state['packageFullName'])
    if package['origin'] != 'store' or package['development'] or os.path.normcase(package['exe']) != os.path.normcase(state['exe']):
        raise HostError('Official executable identity mismatch')
    listeners = host.listeners(state['port'])
    if not listeners or any(p['address'] != '127.0.0.1' or p['pid'] != state.get('ownerPid') for p in listeners):
        raise HostError('CDP listener or owner changed')
    process = host.process(state['ownerPid'], include_package=True)
    if os.path.normcase(process['exe']) != os.path.normcase(package['exe']) or process['packageFullName'] != state['packageFullName']:
        raise HostError('CDP process is not the registered official client')
    if not isinstance(state.get('ownerStartedTicks'), str) or process['startedTicks'] != state['ownerStartedTicks']:
        raise HostError('CDP process identity was reused; Python sessions require their exact native creation timestamp')
    return package

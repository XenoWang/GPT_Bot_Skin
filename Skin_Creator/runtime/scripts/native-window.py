"""Creator-only HWND control for an already verified Python managed session.

Uses Get/SetWindowPlacement in the window's DPI context. No PowerShell,
title matching, process launch, dependency installation or foreground stealing.
"""
import argparse
from contextlib import contextmanager
import ctypes as C
from ctypes import wintypes as W
import json
import os
import sys
import time

from python_host import HostError, WindowsHost, assert_owner, read_json


class Placement(C.Structure):
    _fields_ = [('length', W.UINT), ('flags', W.UINT), ('showCmd', W.UINT),
                ('ptMinPosition', W.POINT), ('ptMaxPosition', W.POINT), ('rcNormalPosition', W.RECT)]


def placement_data(p):
    return {'flags': p.flags, 'showCmd': p.showCmd,
            'min': [p.ptMinPosition.x, p.ptMinPosition.y],
            'max': [p.ptMaxPosition.x, p.ptMaxPosition.y],
            'normal': [p.rcNormalPosition.left, p.rcNormalPosition.top, p.rcNormalPosition.right, p.rcNormalPosition.bottom]}


def placement_value(data):
    if not isinstance(data, dict) or set(data) != {'flags', 'showCmd', 'min', 'max', 'normal'}:
        raise HostError('Invalid saved window placement')
    if type(data['flags']) is not int or not 0 <= data['flags'] <= 7 or type(data['showCmd']) is not int or data['showCmd'] not in (1, 3):
        raise HostError('Only a normal or maximized window can be restored')
    for key, size in [('min', 2), ('max', 2), ('normal', 4)]:
        if not isinstance(data[key], list) or len(data[key]) != size or any(type(v) is not int or not -2147483648 <= v <= 2147483647 for v in data[key]):
            raise HostError('Invalid saved window coordinates')
    p = Placement()
    p.length = C.sizeof(p)
    p.flags, p.showCmd = data['flags'], data['showCmd']
    p.ptMinPosition = W.POINT(*data['min'])
    p.ptMaxPosition = W.POINT(*data['max'])
    p.rcNormalPosition = W.RECT(*data['normal'])
    if p.rcNormalPosition.right <= p.rcNormalPosition.left or p.rcNormalPosition.bottom <= p.rcNormalPosition.top:
        raise HostError('Invalid restored window size')
    return p


class NativeWindows:
    def __init__(self):
        if os.name != 'nt':
            raise HostError('Native window control requires Windows')
        self.api = C.WinDLL('user32', use_last_error=True)
        self.callback_type = C.WINFUNCTYPE(W.BOOL, W.HWND, W.LPARAM)
        signatures = {
            'EnumWindows': ([self.callback_type, W.LPARAM], W.BOOL),
            'GetWindowThreadProcessId': ([W.HWND, C.POINTER(W.DWORD)], W.DWORD),
            'IsWindow': ([W.HWND], W.BOOL), 'IsWindowVisible': ([W.HWND], W.BOOL),
            'IsWindowEnabled': ([W.HWND], W.BOOL), 'GetWindow': ([W.HWND, W.UINT], W.HWND),
            'GetForegroundWindow': ([], W.HWND),
            'GetWindowDpiAwarenessContext': ([W.HWND], W.HANDLE),
            'SetThreadDpiAwarenessContext': ([W.HANDLE], W.HANDLE),
            'GetWindowPlacement': ([W.HWND, C.POINTER(Placement)], W.BOOL),
            'SetWindowPlacement': ([W.HWND, C.POINTER(Placement)], W.BOOL),
        }
        for name, (args, result) in signatures.items():
            fn = getattr(self.api, name)
            fn.argtypes, fn.restype = args, result

    @contextmanager
    def dpi_context(self, hwnd):
        context = self.api.GetWindowDpiAwarenessContext(hwnd)
        previous = self.api.SetThreadDpiAwarenessContext(context) if context else None
        if not previous:
            raise HostError('Cannot bind the window DPI context')
        try:
            yield
        finally:
            if not self.api.SetThreadDpiAwarenessContext(previous):
                raise HostError('Cannot restore the helper DPI context')

    def belongs(self, hwnd, owner):
        pid = W.DWORD()
        return bool(self.api.IsWindow(hwnd) and self.api.GetWindowThreadProcessId(hwnd, C.byref(pid)) and pid.value == owner)

    def snapshot(self, hwnd, owner):
        if not self.belongs(hwnd, owner):
            raise HostError('Native window owner changed')
        with self.dpi_context(hwnd):
            p = Placement()
            p.length = C.sizeof(p)
            if not self.api.GetWindowPlacement(hwnd, C.byref(p)):
                raise HostError('GetWindowPlacement failed')
        return {'handle': str(hwnd), 'foreground': self.api.GetForegroundWindow() == hwnd, 'placement': placement_data(p)}

    def windows(self, owner):
        handles = []

        @self.callback_type
        def visit(hwnd, _):
            if self.belongs(hwnd, owner) and self.api.IsWindowVisible(hwnd) and self.api.IsWindowEnabled(hwnd) and not self.api.GetWindow(hwnd, 4):
                handles.append(hwnd)
            return True

        if not self.api.EnumWindows(visit, 0):
            raise HostError('EnumWindows failed')
        return [self.snapshot(hwnd, owner) for hwnd in handles]

    def apply(self, hwnd, owner, placement):
        p = placement_value(placement)
        with self.dpi_context(hwnd):
            if not self.belongs(hwnd, owner):
                raise HostError('Native window owner changed')
            if not self.api.SetWindowPlacement(hwnd, C.byref(p)):
                raise HostError('SetWindowPlacement failed')
        # SetWindowPlacement can finish after the API returns. Wait for its
        # observed state; a successful request is not a successful transition.
        for _ in range(40):
            result = self.snapshot(hwnd, owner)
            if result['placement']['showCmd'] == placement['showCmd'] and result['placement']['normal'] == placement['normal']:
                return result
            time.sleep(0.05)
        raise HostError('Native window transition did not reach the requested placement')


def main(argv=None):
    parser = argparse.ArgumentParser(description='Managed Creator window placement')
    parser.add_argument('--state', required=True)
    parser.add_argument('--operation', choices=['snapshot', 'normal', 'maximized', 'restore'], required=True)
    parser.add_argument('--token')
    parser.add_argument('--placement')
    args = parser.parse_args(argv)
    state, host = read_json(args.state), WindowsHost()
    assert_owner(state, host)
    process = host.process(state['ownerPid'])
    owner = {'pid': process['pid'], 'startedTicks': process['startedTicks']}
    api = NativeWindows()
    if args.operation == 'snapshot':
        result = {'owner': owner, 'windows': api.windows(owner['pid'])}
    else:
        token = json.loads(args.token or 'null')
        if not isinstance(token, dict) or set(token) != {'pid', 'startedTicks', 'handle'} or token['pid'] != owner['pid'] or token['startedTicks'] != owner['startedTicks'] or not isinstance(token['handle'], str) or not token['handle'].isdigit():
            raise HostError('Native window process identity changed')
        hwnd = int(token['handle'])
        if not 0 < hwnd < 2 ** (C.sizeof(W.HWND) * 8):
            raise HostError('Invalid native window handle')
        current = api.snapshot(hwnd, owner['pid'])
        if args.operation == 'restore':
            placement = json.loads(args.placement or 'null')
        else:
            placement = dict(current['placement'], flags=0, showCmd=1 if args.operation == 'normal' else 3)
        result = api.apply(hwnd, owner['pid'], placement)
    print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except (HostError, OSError, ValueError, TypeError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

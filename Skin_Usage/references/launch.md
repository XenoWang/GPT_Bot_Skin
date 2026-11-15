# Configure, start and restore

Read this module only for launch/setup work. `Inspect-Skin.py status` batches disk metadata; it does not replace the launcher's official package, exact process/start-time, browser and loopback checks. Do not run `doctor` again merely to change a Skin in a running client.

Reuse the existing route and network choice. Ask for proxy/direct only if genuinely unknown. Never change a running client's network settings as a side effect of a Skin change.

## Additional Python route

Requires Python 3.10+, Node.js 22+ and the official Store client. Python and Node must be permitted by the OS; no security restriction is bypassed. Choose the applicable configure command once:

```powershell
python Start-Skin.py configure --proxy-mode direct
python Start-Skin.py configure --proxy-mode proxy --proxy-server 127.0.0.1:7897
```

The port in the proxy example is illustrative; reuse the user's actual local HTTP proxy. Configure does not start a client. Then use `python Start-Skin.py start`; `doctor` reports dependencies without starting, and `restore` removes owned layers. This route has separate configuration/state and never silently adopts the legacy session.

## Existing CMD / PowerShell route

Keep the existing shortcuts. Use **Windows PowerShell** (`powershell.exe`), not an arbitrary PowerShell host:

```powershell
powershell.exe -NoProfile -File runtime/scripts/Configure-CodexSkin.ps1 -ProxyMode direct
```

For a proxy, use `-ProxyMode proxy -ProxyServer <actual-local-host:port>`. `-DesktopShortcut` is available when the user requests a shortcut. Start with `Start-Skin.cmd`; remove owned layers with `Restore-Skin.cmd`.

If an unmanaged client is already running, ask the user to save their draft and exit normally. The existing wait option waits up to ten minutes; never force-close it. Do not change timestamps or browser IDs to make ownership checks pass. Normal client exit/reopen closes the debugging listener after restoration.

## Finite verification

After a requested start, verify the managed status and a bounded actual-window observation, then stop reading/controlling the screen. `active` alone is not proof of complete page coverage. For later routine switching, use the native Skin panel and its saved per-Skin options; retain semantic colors and existing themes.

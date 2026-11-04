import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { isIP, Server, Socket } from 'node:net';
import { promisify } from 'node:util';

export function isLoopback(address) {
  if (isIP(address) === 4) return address.startsWith('127.');
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`http://[${address}]/`).hostname;
  return normalized === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]+\]$/.test(normalized);
}

// Observe actual Node listener addresses, including Vite's auxiliary transports.
// Native Chrome descendants are checked separately through Windows TCP ownership.
export function installListenerGuard() {
  const originalListen = Server.prototype.listen;
  const originalConnect = Socket.prototype.connect;
  const servers = new Set();
  const report = { nodeListeners: [], snapshots: [], backendAttempts: [] };
  Server.prototype.listen = function (...args) {
    servers.add(this);
    this.prependOnceListener('listening', () => {
      const address = this.address();
      if (!address || typeof address === 'string') return;
      report.nodeListeners.push({ pid: process.pid, address: address.address, port: address.port });
      // Close an unsafe listener immediately; the assertion still fails the suite.
      if (!isLoopback(address.address)) this.close();
    });
    return originalListen.apply(this, args);
  };
  Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    const port = typeof options === 'object' ? options?.port : options;
    if (Number(port) === 3001) {
      report.backendAttempts.push({ port: 3001 });
      throw new Error('Browser tests must not connect to the development backend');
    }
    return originalConnect.apply(this, args);
  };
  const assertSafe = () => {
    assert.deepEqual(report.nodeListeners.filter(row => !isLoopback(row.address)), [], 'Non-loopback Node listener');
    assert.deepEqual(report.backendAttempts, [], 'Development backend connection attempted');
    for (const snapshot of report.snapshots) {
      assert.deepEqual(snapshot.listeners.filter(row => !isLoopback(row.address)), [], 'Non-loopback process-tree listener');
    }
  };
  return {
    report, assertSafe,
    async snapshot() {
      // Fail rather than silently claiming native-child coverage on another OS.
      assert.equal(process.platform, 'win32', 'Native-child listener inspection currently requires Windows');
      const script = `
$ErrorActionPreference = 'Stop'
$processes = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId)
$owned = [System.Collections.Generic.HashSet[int]]::new()
[void]$owned.Add(${process.pid})
do {
  $added = $false
  foreach ($entry in $processes) {
    if ($owned.Contains([int]$entry.ParentProcessId) -and $owned.Add([int]$entry.ProcessId)) { $added = $true }
  }
} while ($added)
$listeners = @(Get-NetTCPConnection -State Listen | Where-Object { $owned.Contains([int]$_.OwningProcess) } | ForEach-Object {
  @{ pid = [int]$_.OwningProcess; address = $_.LocalAddress; port = $_.LocalPort }
})
@{ pids = @($owned); listeners = $listeners } | ConvertTo-Json -Depth 4 -Compress
`;
      const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
        { windowsHide: true, timeout: 20000, maxBuffer: 2 * 1024 * 1024 });
      const snapshot = JSON.parse(stdout.trim());
      report.snapshots.push(snapshot);
      assertSafe();
      return snapshot;
    },
    async close() {
      try {
        await Promise.all([...servers].filter(server => server.listening).map(server => new Promise(resolve => server.close(resolve))));
      } finally {
        Server.prototype.listen = originalListen;
        Socket.prototype.connect = originalConnect;
      }
    },
  };
}

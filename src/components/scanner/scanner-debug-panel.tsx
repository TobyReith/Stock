"use client";

export type DebugInfo = {
  devices: Array<{ deviceId: string; label: string; kind: string }>;
  activeDeviceId: string | null;
  activeLabel: string | null;
  capabilities: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  errors: string[];
};

export function ScannerDebugPanel({ info }: { info: DebugInfo }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3 mt-3 text-[11px] font-mono text-foreground space-y-2 max-h-[40vh] overflow-auto">
      <div className="font-semibold text-[12px] text-primary-text">📷 Camera Debug</div>

      <section>
        <div className="text-muted uppercase tracking-widest text-[10px] mb-1">Active</div>
        <div>label: {info.activeLabel ?? "—"}</div>
        <div className="break-all">deviceId: {info.activeDeviceId ?? "—"}</div>
      </section>

      <section>
        <div className="text-muted uppercase tracking-widest text-[10px] mb-1">
          Available video inputs ({info.devices.length})
        </div>
        {info.devices.map((d, i) => (
          <div key={d.deviceId} className="break-all">
            [{i}] {d.label || "(no label)"}
          </div>
        ))}
      </section>

      <section>
        <div className="text-muted uppercase tracking-widest text-[10px] mb-1">Settings</div>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(info.settings, null, 2)}
        </pre>
      </section>

      <section>
        <div className="text-muted uppercase tracking-widest text-[10px] mb-1">Capabilities</div>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(info.capabilities, null, 2)}
        </pre>
      </section>

      <section>
        <div className="text-muted uppercase tracking-widest text-[10px] mb-1">Constraints passed</div>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(info.constraints, null, 2)}
        </pre>
      </section>

      {info.errors.length > 0 && (
        <section>
          <div className="text-danger uppercase tracking-widest text-[10px] mb-1">Errors</div>
          {info.errors.map((e, i) => (
            <div key={i} className="text-danger break-all">{e}</div>
          ))}
        </section>
      )}
    </div>
  );
}

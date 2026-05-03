"use client";

type Preset = {
  label: string;
  prompt: string;
};

export default function TrafficTestPresets({ presets, targetId }: { presets: readonly Preset[]; targetId: string }) {
  return (
    <div className="pager-row" style={{ marginTop: "0.8rem" }}>
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className="chip"
          onClick={() => {
            const target = document.getElementById(targetId) as HTMLTextAreaElement | null;
            if (!target) return;
            target.value = preset.prompt;
            target.focus();
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

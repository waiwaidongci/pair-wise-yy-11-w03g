import { Eligibility } from "../rules/engine";

const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  none: { bg: "#e2e8f0", fg: "#334155", label: "无有效检验" },
  awaiting: { bg: "#fef3c7", fg: "#92400e", label: "待复检审批" },
  approved: { bg: "#dcfce7", fg: "#166534", label: "合格可排队" },
  rejected: { bg: "#fee2e2", fg: "#991b1b", label: "拒充" },
  expired: { bg: "#fee2e2", fg: "#991b1b", label: "检验过期" },
};

export function StageBadge({ elg }: { elg: Eligibility }) {
  const key =
    elg.stage === "approved" && !elg.canQueue && elg.expiry !== undefined
      ? "expired"
      : elg.stage;
  const b = BADGE[key];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: b.bg,
        color: b.fg,
        whiteSpace: "nowrap",
      }}
    >
      {b.label}
    </span>
  );
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

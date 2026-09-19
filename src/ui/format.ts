// 界面层共享的小工具：时间格式化、状态徽标。
import { Eligibility } from "../rules/engine";
import { PlanStatus } from "../rules/types";

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export const KIND_LABEL: Record<string, string> = {
  register: "气瓶登记",
  correct: "信息更正",
  "inspection-pass": "检验合格",
  "inspection-reject": "检验不合格",
  "reject-fill": "拒充登记",
  "plan-void": "计划作废",
  enqueue: "排入队列",
  restore: "恢复排队",
  "approval-blocked": "待审批",
  complete: "完成签收",
};

export function planStatusLabel(s: PlanStatus): string {
  return s === "queued" ? "排队中" : s === "voided" ? "已作废留档" : "已完成签收";
}

export function eligibilityLabel(e: Eligibility): {
  text: string;
  tone: "ok" | "bad" | "warn" | "muted";
} {
  if (e.eligible) return { text: "具备充填资格", tone: "ok" };
  switch (e.status) {
    case "uninspected":
      return { text: "待水压检验", tone: "muted" };
    case "rejected":
      return { text: `拒充：${e.reasons.join("、")}`, tone: "bad" };
    case "pending-approval":
      return { text: "复检合格·待异员审批", tone: "warn" };
    case "stale":
      return { text: "信息已更正·资格失效", tone: "bad" };
  }
}

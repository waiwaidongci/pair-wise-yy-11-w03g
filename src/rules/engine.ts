// 纯业务规则层：不依赖存储、不依赖 React，所有函数对状态只读。
import {
  DomainState,
  FillPlan,
  Inspection,
  InspectionInput,
  RejectionRecord,
} from "./types";
import {
  HYDRAULIC_RATIO,
  MAX_RESIDUAL_DEFORMATION,
  REASON,
} from "./constants";

export type InspectionEvaluation = {
  reasons: string[];
  result: "pass" | "reject";
  requiredPressure: number;
};

// 依据检验单数据判定合格/拒充。
// 水压不足、变形率超标、检验员缺失 → 只能拒充。
export function evaluateInspection(
  input: InspectionInput,
  workingPressure: number
): InspectionEvaluation {
  const requiredPressure = Math.round(workingPressure * HYDRAULIC_RATIO);
  const reasons: string[] = [];

  if (!input.date.trim()) reasons.push(REASON.DATE_MISSING);
  if (input.testPressure == null || input.testPressure < requiredPressure) {
    reasons.push(REASON.PRESSURE_LOW);
  }
  if (
    input.residualDeformation == null ||
    input.residualDeformation > MAX_RESIDUAL_DEFORMATION
  ) {
    reasons.push(REASON.DEFORMATION_HIGH);
  }
  if (!input.inspector.trim()) reasons.push(REASON.INSPECTOR_MISSING);

  return {
    reasons,
    result: reasons.length === 0 ? "pass" : "reject",
    requiredPressure,
  };
}

// 审批人校验：复检恢复排队时，审批人必须存在且与检验员不同。
export type ApprovalCheck =
  | { ok: true }
  | { ok: false; reason: string };

export function checkApproval(inspector: string, approver: string): ApprovalCheck {
  const a = approver.trim();
  if (!a) return { ok: false, reason: "审批人缺失，不能恢复排队" };
  if (a === inspector.trim()) {
    return { ok: false, reason: "审批人不得与检验员为同一人" };
  }
  return { ok: true };
}

// 该气瓶当前版本下唯一的有效检验单：版本匹配且未被替代。
export function activeInspectionOf(
  state: Pick<DomainState, "inspections">,
  cylinderId: string,
  version: number
): Inspection | undefined {
  return state.inspections.find(
    (i) => i.cylinderId === cylinderId && i.version === version && !i.superseded
  );
}

// 未核销的拒充记录（信息更正版本变化后旧记录不再约束新记录，但仍留档可查）。
export function openRejectionOf(
  state: Pick<DomainState, "rejections">,
  cylinderId: string,
  version: number
): RejectionRecord | undefined {
  return state.rejections.find(
    (r) => r.cylinderId === cylinderId && r.version === version && !r.resolved
  );
}

export function queuedPlansOf(
  state: Pick<DomainState, "plans">,
  cylinderId?: string,
  version?: number
): FillPlan[] {
  return state.plans
    .filter(
      (p) =>
        p.status === "queued" &&
        (cylinderId === undefined ||
          (p.cylinderId === cylinderId &&
            (version === undefined || p.version === version)))
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

// 是否属于复检：同版本此前已有检验单（无论是否合格）。
export function isReinspection(
  state: Pick<DomainState, "inspections">,
  cylinderId: string,
  version: number
): boolean {
  return state.inspections.some(
    (i) => i.cylinderId === cylinderId && i.version === version
  );
}

export type Eligibility =
  | { eligible: true }
  | {
      eligible: false;
      status:
        | "uninspected" // 尚无有效检验单
        | "rejected" // 检验不合格/拒充
        | "pending-approval" // 复检合格，待异员审批恢复
        | "stale"; // 信息已更正，排队资格失效
      reasons: string[];
      inspection?: Inspection;
    };

// 判定某只气瓶当前是否具备充填排队资格。
export function eligibilityOf(
  state: DomainState,
  cylinderId: string,
  version: number
): Eligibility {
  const insp = activeInspectionOf(state, cylinderId, version);
  if (!insp) return { eligible: false, status: "uninspected", reasons: [] };
  if (insp.result === "reject") {
    return {
      eligible: false,
      status: "rejected",
      reasons: insp.reasons,
      inspection: insp,
    };
  }
  // 合格单：复检场景下须有异员审批才恢复排队
  if (!insp.restoredQueue) {
    const reinspection = state.inspections.some(
      (i) =>
        i.id !== insp.id &&
        i.cylinderId === cylinderId &&
        i.version === version
    );
    const open = openRejectionOf(state, cylinderId, version);
    if (reinspection || open) {
      return {
        eligible: false,
        status: "pending-approval",
        reasons: [],
        inspection: insp,
      };
    }
    // 首次检验即合格，且没有未核销拒充：可直接排队
  }
  return { eligible: true };
}

// 针对具体充填计划的资格（信息更正后版本不匹配 → 资格失效）。
export function planEligibility(
  state: DomainState,
  plan: FillPlan
): Eligibility | { eligible: true } {
  const cy = state.cylinders.find((c) => c.id === plan.cylinderId);
  if (!cy || cy.version !== plan.version) {
    return { eligible: false, status: "stale", reasons: [] };
  }
  return eligibilityOf(state, plan.cylinderId, cy.version);
}

// 单瓶履历：按时间升序返回全部相关事件（含历史版本，更正前记录仍可追溯）。
export function historyOf(state: DomainState, cylinderId: string) {
  return state.events
    .filter((e) => e.cylinderId === cylinderId)
    .sort((a, b) => a.at - b.at);
}

export function inspectionHistoryOf(
  state: DomainState,
  cylinderId: string
): Inspection[] {
  return state.inspections
    .filter((i) => i.cylinderId === cylinderId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// 混合气比例提示
export function mixHint(o2: number, he: number): string {
  if (o2 + he > 100) return "氧+氦比例之和不能超过 100%";
  if (o2 < 0 || he < 0 || o2 > 100 || he > 100) return "比例须在 0–100% 之间";
  if (he > 0) return `Trimix：O₂ ${o2}% / He ${he}% / N₂ ${100 - o2 - he}%`;
  if (o2 > 21) return `高氧 EAN${o2}：注意富氧充填清洁要求`;
  return `普通空气：O₂ 约 21%（当前填写 ${o2}%）`;
}

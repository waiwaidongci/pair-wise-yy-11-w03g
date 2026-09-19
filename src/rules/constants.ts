// 业务规则常量 —— 所有判定阈值集中在此，规则与界面/存储解耦

// 水压试验合格：实测水压值必须达到公称工作压力的 5/3（气瓶常规水检系数）
export const TEST_PRESSURE_FACTOR = 5 / 3;
// 残余变形率上限（%）
export const MAX_RESIDUAL_DEFORMATION_RATE = 10;
// 检验有效期（年）
export const TEST_VALID_YEARS = 1;
// 信息更正宽限天数（仅用于界面“临期提醒”，不影响规则判定）
export const EXPIRY_WARN_DAYS = 30;

export function todayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addYears(date: string, years: number): string {
  const d = new Date(date + "T00:00:00");
  d.setFullYear(d.getFullYear() + years);
  return todayStr(d);
}

export function daysBetween(from: string, to: string = todayStr()): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

/** 水压值是否达标：不低于工作压力 × 5/3 */
export function pressurePasses(testPressure: number, workingPressure: number): boolean {
  return testPressure >= workingPressure * TEST_PRESSURE_FACTOR - 1e-9;
}

/** 残余变形率是否合格 */
export function deformationPasses(rate: number): boolean {
  return rate <= MAX_RESIDUAL_DEFORMATION_RATE + 1e-9;
}

/** 检验员/审批人信息是否缺失 */
export function personnelMissing(inspector: string, approver?: string): {
  inspector: boolean;
  approver: boolean;
} {
  return {
    inspector: inspector.trim().length === 0,
    approver: approver !== undefined && approver.trim().length === 0,
  };
}

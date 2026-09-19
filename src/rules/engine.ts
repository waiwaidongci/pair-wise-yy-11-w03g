// 规则引擎：纯函数实现全部业务判定，输入状态、输出新状态
// 任何违反规则的操作抛出 Error，由界面层捕获展示

import {
  AppState,
  Cylinder,
  FillPlan,
  GasMode,
  HydroTest,
  RejectionRecord,
} from "./types";
import {
  addYears,
  deformationPasses,
  personnelMissing,
  pressurePasses,
  TEST_VALID_YEARS,
  todayStr,
} from "./constants";

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

export function emptyState(): AppState {
  return { cylinders: [], tests: [], plans: [], rejections: [], events: [], seq: 1 };
}

function log(state: AppState, cylinderId: string, kind: string, detail: string) {
  state.events.push({
    id: uid("evt"),
    cylinderId,
    at: new Date().toISOString(),
    kind,
    detail,
  });
}

// ---------- 查询选择器 ----------

/** 取得气瓶当前唯一有效的检验单（未被取代） */
export function activeTest(state: AppState, cylinderId: string): HydroTest | undefined {
  return state.tests.find(
    (t) => t.cylinderId === cylinderId && t.status !== "superseded",
  );
}

/** 进行中的充填计划（仅在队；已签收为历史完成记录，不阻塞、不作废） */
export function activePlan(state: AppState, cylinderId: string): FillPlan | undefined {
  return state.plans.find(
    (p) => p.cylinderId === cylinderId && p.status === "queued",
  );
}

/** 未闭环的拒充记录（拒充之后尚无合格审批） */
export function openRejection(
  state: AppState,
  cylinderId: string,
): RejectionRecord | undefined {
  const rej = [...state.rejections]
    .reverse()
    .find((r) => r.cylinderId === cylinderId && !r.resolvedAt);
  return rej;
}

export interface Eligibility {
  canQueue: boolean;
  stage: "none" | "awaiting" | "approved" | "rejected";
  reasons: string[];
  test?: HydroTest;
  expiry?: string;
}

/** 按当前记录重算单瓶排队资格 —— 所有视图统一以此为准 */
export function eligibility(state: AppState, cylinderId: string): Eligibility {
  const cyl = state.cylinders.find((c) => c.id === cylinderId);
  const test = activeTest(state, cylinderId);
  const reasons: string[] = [];

  if (!cyl) return { canQueue: false, stage: "none", reasons: ["气瓶不存在"] };
  if (!test) return { canQueue: false, stage: "none", reasons: ["尚无有效检验单"] };

  if (test.tankRevision !== cyl.revision) {
    reasons.push("气瓶信息已更正，旧检验单失效，须按新记录重检");
    return { canQueue: false, stage: "none", reasons, test };
  }

  if (test.status === "rejected") {
    const rej = openRejection(state, cylinderId);
    reasons.push(...(rej?.reasons ?? ["检验不合格，已拒充"]));
    return { canQueue: false, stage: "rejected", reasons, test };
  }
  if (test.status === "awaiting") {
    reasons.push("检验合格，等待复检审批（审批人须与检验员不同）");
    return { canQueue: false, stage: "awaiting", reasons, test };
  }

  // approved
  const expiry = addYears(test.testDate, TEST_VALID_YEARS);
  if (expiry < todayStr()) {
    reasons.push(`检验已于 ${expiry} 到期，须重新送检`);
    return { canQueue: false, stage: "approved", reasons, test, expiry };
  }
  return { canQueue: true, stage: "approved", reasons: [], test, expiry };
}

export interface TestEvaluation {
  pass: boolean;
  reasons: string[];
  requiredPressure: number;
}

/** 检验单判定：水压不足 / 变形率超标 / 人员缺失 任一即不合格 */
export function evaluateTest(
  cyl: Cylinder,
  input: { testPressure: number; residualDeformationRate: number; inspector: string },
): TestEvaluation {
  const required = cyl.workingPressure * (5 / 3);
  const reasons: string[] = [];
  if (!pressurePasses(input.testPressure, cyl.workingPressure)) {
    reasons.push(`水压不足：实测 ${input.testPressure}bar，须≥${Math.round(required)}bar`);
  }
  if (!deformationPasses(input.residualDeformationRate)) {
    reasons.push(
      `残余变形率超标：${input.residualDeformationRate}%，须≤10%`,
    );
  }
  if (personnelMissing(input.inspector).inspector) {
    reasons.push("检验员缺失");
  }
  return { pass: reasons.length === 0, reasons, requiredPressure: required };
}

// ---------- 写操作 ----------

export interface CylinderInput {
  code: string;
  volume: string;
  material: string;
  workingPressure: number;
}

export function addCylinder(state: AppState, input: CylinderInput): AppState {
  const next = clone(state);
  if (!input.code.trim()) throw new Error("气瓶编号不能为空");
  if (next.cylinders.some((c) => c.code === input.code.trim())) {
    throw new Error(`气瓶编号 ${input.code} 已存在`);
  }
  if (!(input.workingPressure > 0)) throw new Error("公称工作压力须大于 0");
  const now = new Date().toISOString();
  const cyl: Cylinder = {
    id: uid("cyl"),
    code: input.code.trim(),
    volume: input.volume.trim() || "未填容积",
    material: input.material.trim() || "未填材质",
    workingPressure: input.workingPressure,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  next.cylinders.push(cyl);
  log(next, cyl.id, "建档", `气瓶 ${cyl.code} 建档，公称压力 ${cyl.workingPressure}bar`);
  return next;
}

/**
 * 气瓶信息更正：旧检验单与排队资格立即失效，已作废计划留档，按新记录重算。
 */
export function correctCylinder(
  state: AppState,
  cylinderId: string,
  input: CylinderInput,
): AppState {
  const next = clone(state);
  const cyl = next.cylinders.find((c) => c.id === cylinderId);
  if (!cyl) throw new Error("气瓶不存在");
  if (
    next.cylinders.some((c) => c.id !== cylinderId && c.code === input.code.trim())
  ) {
    throw new Error(`气瓶编号 ${input.code} 与其他气瓶冲突`);
  }
  if (!(input.workingPressure > 0)) throw new Error("公称工作压力须大于 0");

  const oldCode = cyl.code;
  const oldPressure = cyl.workingPressure;
  cyl.code = input.code.trim();
  cyl.volume = input.volume.trim() || cyl.volume;
  cyl.material = input.material.trim() || cyl.material;
  cyl.workingPressure = input.workingPressure;
  cyl.revision += 1;
  cyl.updatedAt = new Date().toISOString();

  // 旧检验单全部失效（唯一有效单被取代留痕，其余历史单保持 superseded）
  for (const t of next.tests) {
    if (t.cylinderId === cylinderId && t.status !== "superseded") {
      t.status = "superseded";
      t.decidedAt = new Date().toISOString();
    }
  }
  // 未闭环拒充记录随信息更正一并闭环（须按新记录重新判定）
  for (const r of next.rejections) {
    if (r.cylinderId === cylinderId && !r.resolvedAt) {
      r.resolvedAt = new Date().toISOString();
    }
  }
  // 排队资格立即失效：在队计划作废并留档（已签收为历史事实，不作废）
  const voided: string[] = [];
  for (const p of next.plans) {
    if (p.cylinderId === cylinderId && p.status === "queued") {
      p.status = "void";
      p.archive = true;
      p.voidReason = `气瓶信息更正（${oldCode}/${oldPressure}bar → ${cyl.code}/${cyl.workingPressure}bar），资格按新记录重算`;
      voided.push(p.id);
    }
  }

  log(
    next,
    cylinderId,
    "信息更正",
    `信息由 ${oldCode}/${oldPressure}bar 更正为 ${cyl.code}/${cyl.workingPressure}bar；旧检验单失效，${voided.length} 条充填计划作废留档，须按新记录重检`,
  );
  return next;
}

export interface TestInput {
  testDate: string;
  testPressure: number;
  residualDeformationRate: number;
  inspector: string;
}

/**
 * 登记水压检验单：每瓶仅保留一条有效单，旧有效单自动被取代。
 * 不合格 → 拒充：生成拒充记录，已有充填计划一律作废留档。
 * 合格 → 待审批，须审批人与检验员不同方可恢复排队。
 */
export function registerTest(
  state: AppState,
  cylinderId: string,
  input: TestInput,
): AppState {
  const next = clone(state);
  const cyl = next.cylinders.find((c) => c.id === cylinderId);
  if (!cyl) throw new Error("气瓶不存在");
  if (!input.testDate) throw new Error("检验日期不能为空");
  if (input.testDate > todayStr()) throw new Error("检验日期不能晚于今天");

  const ev = evaluateTest(cyl, input);
  const now = new Date().toISOString();

  // 取代旧的有效检验单
  for (const t of next.tests) {
    if (t.cylinderId === cylinderId && t.status !== "superseded") {
      t.status = "superseded";
      t.decidedAt = now;
    }
  }

  const test: HydroTest = {
    id: uid("test"),
    cylinderId,
    testDate: input.testDate,
    testPressure: input.testPressure,
    residualDeformationRate: input.residualDeformationRate,
    inspector: input.inspector.trim(),
    status: ev.pass ? "awaiting" : "rejected",
    tankRevision: cyl.revision,
    createdAt: now,
    decidedAt: ev.pass ? undefined : now,
  };

  if (ev.pass) {
    next.tests.push(test);
    log(
      next,
      cylinderId,
      "检验登记",
      `检验单合格待审批：水压 ${input.testPressure}bar、变形率 ${input.residualDeformationRate}%、检验员 ${input.inspector.trim()}`,
    );
    return next;
  }

  // 拒充：在队计划作废留档（已签收为历史事实，保留）
  const voidedPlanIds: string[] = [];
  for (const p of next.plans) {
    if (p.cylinderId === cylinderId && p.status === "queued") {
      p.status = "void";
      p.archive = true;
      p.voidReason = `水压检验不合格拒充：${ev.reasons.join("；")}`;
      voidedPlanIds.push(p.id);
    }
  }

  const rejection: RejectionRecord = {
    id: uid("rej"),
    cylinderId,
    testId: test.id,
    reasons: ev.reasons,
    voidedPlanIds,
    createdAt: now,
  };
  test.rejectionId = rejection.id;
  next.tests.push(test);
  next.rejections.push(rejection);
  log(
    next,
    cylinderId,
    "拒充",
    `检验不合格拒充：${ev.reasons.join("；")}；${voidedPlanIds.length} 条充填计划作废留档`,
  );
  return next;
}

/**
 * 复检审批：审批人不得缺失且必须与检验员不同；通过后恢复排队。
 */
export function approveTest(
  state: AppState,
  testId: string,
  approver: string,
): AppState {
  const next = clone(state);
  const test = next.tests.find((t) => t.id === testId);
  if (!test) throw new Error("检验单不存在");
  if (test.status !== "awaiting") throw new Error("仅待审批检验单可审批");
  const name = approver.trim();
  if (!name) throw new Error("审批人缺失，不能恢复排队");
  if (name === test.inspector) {
    throw new Error("审批人必须与检验员不同");
  }
  const cyl = next.cylinders.find((c) => c.id === test.cylinderId);
  if (!cyl || test.tankRevision !== cyl.revision) {
    test.status = "superseded";
    throw new Error("气瓶信息已更正，该检验单失效，须按新记录重检");
  }

  test.status = "approved";
  test.approver = name;
  test.decidedAt = new Date().toISOString();

  // 闭环历史拒充记录
  for (const r of next.rejections) {
    if (r.cylinderId === test.cylinderId && !r.resolvedAt) {
      r.resolvedAt = test.decidedAt;
      r.resolveTestId = test.id;
    }
  }

  // 恢复排队：被作废计划保持留档，按最近一条留档计划复制新排队计划
  const archived = [...next.plans]
    .reverse()
    .find((p) => p.cylinderId === test.cylinderId && p.status === "void" && p.archive);
  if (archived && !activePlan(next, test.cylinderId)) {
    const restored: FillPlan = {
      ...clone(archived),
      id: uid("plan"),
      status: "queued",
      createdAt: new Date().toISOString(),
      signedAt: undefined,
      voidReason: undefined,
      archive: false,
    };
    next.plans.push(restored);
  }

  log(
    next,
    test.cylinderId,
    "复检通过",
    `复检合格，审批人 ${name}（检验员 ${test.inspector}），排队资格恢复`,
  );
  return next;
}

export interface PlanInput {
  mode: GasMode;
  oxygen: number;
  helium: number;
  targetPressure: number;
  operator: string;
}

/** 排入待充填队列：仅当当前有效检验审批合格且在有效期内 */
export function enqueue(state: AppState, cylinderId: string, input: PlanInput): AppState {
  const next = clone(state);
  const elg = eligibility(next, cylinderId);
  if (!elg.canQueue) throw new Error(elg.reasons.join("；") || "当前不可排队");
  if (activePlan(next, cylinderId)) throw new Error("该气瓶已有进行中的充填计划");
  if (!input.operator.trim()) throw new Error("操作员不能为空");
  if (input.targetPressure <= 0) throw new Error("目标压力须大于 0");
  if (helixMixInvalid(input)) throw new Error(mixError(input));

  const plan: FillPlan = {
    id: uid("plan"),
    cylinderId,
    mode: input.mode,
    oxygen: input.oxygen,
    helium: input.helium,
    targetPressure: input.targetPressure,
    operator: input.operator.trim(),
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  next.plans.push(plan);
  log(
    next,
    cylinderId,
    "排入队列",
    `${input.mode} 充填计划入队，目标 ${input.targetPressure}bar，操作员 ${input.operator.trim()}`,
  );
  return next;
}

function helixMixInvalid(input: PlanInput): boolean {
  if (input.oxygen < 0 || input.helium < 0) return true;
  if (input.mode === "空气") return input.oxygen !== 21 || input.helium !== 0;
  if (input.mode === "高氧") return input.oxygen <= 21 || input.oxygen >= 100 || input.helium !== 0;
  return input.oxygen + input.helium >= 100 || input.helium <= 0; // Trimix
}

function mixError(input: PlanInput): string {
  if (input.mode === "空气") return "空气充填：氧含量须 21%，氦含量须 0%";
  if (input.mode === "高氧") return "高氧充填：21% < 氧含量 < 100%，氦含量须 0%";
  return "Trimix：氦含量须大于 0，且氧+氦 < 100%";
}

/** 充填完成签收 */
export function signOff(state: AppState, planId: string): AppState {
  const next = clone(state);
  const plan = next.plans.find((p) => p.id === planId);
  if (!plan) throw new Error("充填计划不存在");
  if (plan.status !== "queued") throw new Error("仅在队计划可签收");
  plan.status = "signed";
  plan.signedAt = new Date().toISOString();
  log(next, plan.cylinderId, "签收", `${plan.mode} 充填完成，客户签收`);
  return next;
}

// ---------- 单瓶履历 ----------

export interface HistoryRow {
  at: string;
  kind: string;
  detail: string;
}

export function cylinderHistory(state: AppState, cylinderId: string): HistoryRow[] {
  return state.events
    .filter((e) => e.cylinderId === cylinderId)
    .map((e) => ({ at: e.at, kind: e.kind, detail: e.detail }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}

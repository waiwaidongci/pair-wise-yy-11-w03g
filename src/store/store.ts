// 存储层：localStorage 持久化 + 全部写操作。
// 所有业务判定都调用 rules 层；本层只负责状态变更、事件留痕与持久化，
// 刷新后队列、拒充记录、单瓶履历保持一致。
import { useSyncExternalStore } from "react";
import {
  Cylinder,
  DomainState,
  FillPlan,
  HistoryEvent,
  Inspection,
  InspectionInput,
  RejectionRecord,
} from "../rules/types";
import {
  activeInspectionOf,
  checkApproval,
  eligibilityOf,
  evaluateInspection,
  isReinspection,
  mixHint,
  openRejectionOf,
  queuedPlansOf,
} from "../rules/engine";

type Persisted = DomainState & { seq: number };
const STORAGE_KEY = "hydro-fill-station-v1";

export type PlanInput = {
  residualPressure: number;
  targetPressure: number;
  o2: number;
  he: number;
  mode: string;
  operator: string;
};

type Result = { ok: boolean; error?: string; id?: string };

let seq = 1;
const nextId = (prefix: string) => `${prefix}-${String(seq++).padStart(4, "0")}`;

function emptyState(): Persisted {
  return {
    seq,
    cylinders: [],
    inspections: [],
    plans: [],
    rejections: [],
    events: [],
  };
}

function pushEvent(
  s: Persisted,
  cylinderId: string,
  version: number,
  kind: HistoryEvent["kind"],
  detail: string,
  refs?: HistoryEvent["refs"]
) {
  s.events.push({
    id: nextId("EV"),
    cylinderId,
    version,
    kind,
    at: Date.now(),
    detail,
    refs,
  });
}

// ---------- 种子数据 ----------
function seed(): Persisted {
  seq = 1;
  const s = emptyState();
  const now = Date.now();
  const day = 86400000;

  const mk = <T,>(p: string, extra: Partial<T> & Record<string, unknown>): T =>
    ({ id: nextId(p), ...extra } as T);

  // TANK-204：首次检验合格，排队中
  const c1 = mk<Cylinder>("CY", {
    id: "TANK-204",
    volume: "12L铝瓶",
    workingPressure: 200,
    version: 1,
    registeredAt: now - 20 * day,
  });
  s.cylinders.push(c1);
  const i1 = mk<Inspection>("IN", {
    cylinderId: "TANK-204",
    version: 1,
    date: "2026-08-20",
    testPressure: 300,
    residualDeformation: 4.2,
    inspector: "周检验",
    approver: "",
    result: "pass",
    reasons: [],
    superseded: false,
    restoredQueue: true,
    createdAt: now - 30 * day,
  });
  s.inspections.push(i1);
  const p1 = mk<FillPlan>("PL", {
    cylinderId: "TANK-204",
    version: 1,
    residualPressure: 55,
    targetPressure: 200,
    o2: 21,
    he: 0,
    mode: "空气",
    operator: "王充填",
    status: "queued",
    createdAt: now - 2 * day,
  });
  s.plans.push(p1);
  s.events.push(
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-204",
      version: 1,
      kind: "register",
      at: now - 20 * day,
      detail: "登记气瓶 12L铝瓶 / 工作压力 200bar",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-204",
      version: 1,
      kind: "inspection-pass",
      at: now - 30 * day,
      detail: "水压 300bar、残余变形率 4.2%，检验合格（检验员 周检验）",
      refs: { inspectionId: i1.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-204",
      version: 1,
      kind: "enqueue",
      at: now - 2 * day,
      detail: "空气充填计划入队：55→200bar（操作员 王充填）",
      refs: { planId: p1.id },
    })
  );

  // TANK-219：水压不足拒充，原 EAN32 计划作废留档
  s.cylinders.push(
    mk<Cylinder>("CY", {
      id: "TANK-219",
      volume: "11L钢瓶",
      workingPressure: 232,
      version: 1,
      registeredAt: now - 40 * day,
    })
  );
  const p2void = mk<FillPlan>("PL", {
    cylinderId: "TANK-219",
    version: 1,
    residualPressure: 40,
    targetPressure: 232,
    o2: 32,
    he: 0,
    mode: "高氧 EAN32",
    operator: "王充填",
    status: "voided",
    createdAt: now - 9 * day,
    voidedAt: now - 8 * day,
    voidReason: "拒充：水压不足；残余变形率超标",
  });
  s.plans.push(p2void);
  const i2 = mk<Inspection>("IN", {
    cylinderId: "TANK-219",
    version: 1,
    date: "2026-09-11",
    testPressure: 320,
    residualDeformation: 12.5,
    inspector: "周检验",
    approver: "",
    result: "reject",
    reasons: ["水压不足", "残余变形率超标"],
    superseded: false,
    restoredQueue: false,
    createdAt: now - 8 * day,
  });
  s.inspections.push(i2);
  s.rejections.push(
    mk<RejectionRecord>("RJ", {
      cylinderId: "TANK-219",
      version: 1,
      inspectionId: i2.id,
      date: "2026-09-11",
      reasons: ["水压不足", "残余变形率超标"],
      inspector: "周检验",
      voidedPlanIds: [p2void.id],
      resolved: false,
      createdAt: now - 8 * day,
    })
  );
  s.events.push(
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-219",
      version: 1,
      kind: "register",
      at: now - 40 * day,
      detail: "登记气瓶 11L钢瓶 / 工作压力 232bar",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-219",
      version: 1,
      kind: "enqueue",
      at: now - 9 * day,
      detail: "高氧 EAN32 充填计划入队：40→232bar（操作员 王充填）",
      refs: { planId: p2void.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-219",
      version: 1,
      kind: "inspection-reject",
      at: now - 8 * day,
      detail: "水压 320bar（要求 ≥348bar）、变形率 12.5%，判定不合格",
      refs: { inspectionId: i2.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-219",
      version: 1,
      kind: "plan-void",
      at: now - 8 * day,
      detail: `充填计划 ${p2void.id} 因拒充作废并留档`,
      refs: { planId: p2void.id, rejectionId: s.rejections[0].id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-219",
      version: 1,
      kind: "reject-fill",
      at: now - 8 * day,
      detail: "拒充登记：水压不足、残余变形率超标（检验员 周检验）",
      refs: { inspectionId: i2.id, rejectionId: s.rejections[0].id },
    })
  );

  // TANK-231：检验合格、已完成签收
  s.cylinders.push(
    mk<Cylinder>("CY", {
      id: "TANK-231",
      volume: "双瓶组",
      workingPressure: 200,
      version: 1,
      registeredAt: now - 60 * day,
    })
  );
  const i3 = mk<Inspection>("IN", {
    cylinderId: "TANK-231",
    version: 1,
    date: "2026-07-30",
    testPressure: 305,
    residualDeformation: 6.1,
    inspector: "李检验",
    approver: "",
    result: "pass",
    reasons: [],
    superseded: false,
    restoredQueue: true,
    createdAt: now - 50 * day,
  });
  s.inspections.push(i3);
  s.plans.push(
    mk<FillPlan>("PL", {
      cylinderId: "TANK-231",
      version: 1,
      residualPressure: 30,
      targetPressure: 200,
      o2: 21,
      he: 0,
      mode: "空气",
      operator: "王充填",
      status: "completed",
      createdAt: now - 6 * day,
      completedAt: now - 5 * day,
      signOff: "客户陈先生",
    })
  );
  s.events.push(
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-231",
      version: 1,
      kind: "register",
      at: now - 60 * day,
      detail: "登记气瓶 双瓶组 / 工作压力 200bar",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-231",
      version: 1,
      kind: "inspection-pass",
      at: now - 50 * day,
      detail: "水压 305bar、残余变形率 6.1%，检验合格（检验员 李检验）",
      refs: { inspectionId: i3.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-231",
      version: 1,
      kind: "complete",
      at: now - 5 * day,
      detail: "充填完成，签收人：客户陈先生",
    })
  );

  // TANK-260：首轮拒充 → 复检合格，待异员审批恢复
  s.cylinders.push(
    mk<Cylinder>("CY", {
      id: "TANK-260",
      volume: "12L钢瓶",
      workingPressure: 200,
      version: 1,
      registeredAt: now - 35 * day,
    })
  );
  const i4a = mk<Inspection>("IN", {
    cylinderId: "TANK-260",
    version: 1,
    date: "2026-08-15",
    testPressure: 298,
    residualDeformation: 5.0,
    inspector: "李检验",
    approver: "",
    result: "reject",
    reasons: ["水压不足"],
    superseded: true,
    restoredQueue: false,
    createdAt: now - 12 * day,
  });
  const i4b = mk<Inspection>("IN", {
    cylinderId: "TANK-260",
    version: 1,
    date: "2026-09-16",
    testPressure: 302,
    residualDeformation: 4.8,
    inspector: "李检验",
    approver: "",
    result: "pass",
    reasons: [],
    superseded: false,
    restoredQueue: false,
    createdAt: now - 3 * day,
  });
  s.inspections.push(i4a, i4b);
  const rj4 = mk<RejectionRecord>("RJ", {
    cylinderId: "TANK-260",
    version: 1,
    inspectionId: i4a.id,
    date: "2026-08-15",
    reasons: ["水压不足"],
    inspector: "李检验",
    voidedPlanIds: [],
    resolved: false,
    createdAt: now - 12 * day,
  });
  s.rejections.push(rj4);
  s.events.push(
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-260",
      version: 1,
      kind: "register",
      at: now - 35 * day,
      detail: "登记气瓶 12L钢瓶 / 工作压力 200bar",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-260",
      version: 1,
      kind: "inspection-reject",
      at: now - 12 * day,
      detail: "首轮水压 298bar（要求 ≥300bar），判定不合格",
      refs: { inspectionId: i4a.id, rejectionId: rj4.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-260",
      version: 1,
      kind: "reject-fill",
      at: now - 12 * day,
      detail: "拒充登记：水压不足（检验员 李检验）",
      refs: { inspectionId: i4a.id, rejectionId: rj4.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-260",
      version: 1,
      kind: "inspection-pass",
      at: now - 3 * day,
      detail: "复检水压 302bar、变形率 4.8%，合格；待异员审批后恢复排队",
      refs: { inspectionId: i4b.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-260",
      version: 1,
      kind: "approval-blocked",
      at: now - 3 * day,
      detail: "复检合格但尚未审批（审批人须不同于检验员 李检验）",
      refs: { inspectionId: i4b.id },
    })
  );

  // TANK-270：信息已更正（工作压力 200→232），旧检验与排队资格失效
  s.cylinders.push(
    mk<Cylinder>("CY", {
      id: "TANK-270",
      volume: "11.1L铝瓶",
      workingPressure: 232,
      version: 2,
      registeredAt: now - 25 * day,
    })
  );
  const i5 = mk<Inspection>("IN", {
    cylinderId: "TANK-270",
    version: 1,
    date: "2026-08-10",
    testPressure: 300,
    residualDeformation: 3.9,
    inspector: "周检验",
    approver: "",
    result: "pass",
    reasons: [],
    superseded: true,
    restoredQueue: true,
    createdAt: now - 22 * day,
  });
  s.inspections.push(i5);
  s.plans.push(
    mk<FillPlan>("PL", {
      cylinderId: "TANK-270",
      version: 1,
      residualPressure: 60,
      targetPressure: 200,
      o2: 32,
      he: 0,
      mode: "高氧 EAN32",
      operator: "王充填",
      status: "voided",
      createdAt: now - 10 * day,
      voidedAt: now - 4 * day,
      voidReason: "气瓶信息更正（v1→v2），旧检验与排队资格失效",
    })
  );
  s.events.push(
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-270",
      version: 1,
      kind: "register",
      at: now - 25 * day,
      detail: "登记气瓶 12L铝瓶 / 工作压力 200bar",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-270",
      version: 1,
      kind: "inspection-pass",
      at: now - 22 * day,
      detail: "水压 300bar、残余变形率 3.9%，检验合格（检验员 周检验）",
      refs: { inspectionId: i5.id },
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-270",
      version: 2,
      kind: "correct",
      at: now - 4 * day,
      detail: "气瓶信息更正：12L铝瓶/200bar → 11.1L铝瓶/232bar，旧检验与排队资格立即失效",
    }),
    mk<HistoryEvent>("EV", {
      cylinderId: "TANK-270",
      version: 1,
      kind: "plan-void",
      at: now - 4 * day,
      detail: "原高氧充填计划因信息更动作废留档，须按新记录重新检验排队",
    })
  );

  s.seq = seq;
  return s;
}

// ---------- 持久化 ----------
function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      seq = parsed.seq ?? 1;
      return parsed;
    }
  } catch {
    // 损坏数据回退到种子
  }
  const s = seed();
  persist(s);
  return s;
}

function persist(s: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 存储不可用时仅保留内存态
  }
}

let state: Persisted = load();
const listeners = new Set<() => void>();
function commit() {
  state.seq = seq;
  persist(state);
  listeners.forEach((l) => l());
}

// 在副本上执行变更，失败则整体放弃，避免半成品状态。
function mutate(fn: (draft: Persisted) => Result | void): Result {
  const draft: Persisted = structuredClone(state);
  let result: Result = { ok: true };
  try {
    const r = fn(draft);
    if (r) result = r;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!result.ok) return result;
  state = draft;
  commit();
  return result;
}

// 将同版本最近一张作废计划恢复为新排队计划
function restoreLastVoidedPlan(s: Persisted, cylinderId: string, version: number) {
  const last = [...s.plans]
    .filter(
      (p) =>
        p.cylinderId === cylinderId &&
        p.version === version &&
        p.status === "voided"
    )
    .sort((a, b) => (b.voidedAt ?? b.createdAt) - (a.voidedAt ?? a.createdAt))[0];
  if (!last) return;
  const plan: FillPlan = {
    ...last,
    id: nextId("PL"),
    status: "queued",
    createdAt: Date.now(),
    voidedAt: undefined,
    voidReason: undefined,
    requeuedFrom: last.id,
    completedAt: undefined,
    signOff: undefined,
  };
  s.plans.push(plan);
  pushEvent(
    s,
    cylinderId,
    version,
    "enqueue",
    `复检审批通过，按旧单 ${last.id} 重新排队（${plan.mode} ${plan.residualPressure}→${plan.targetPressure}bar）`,
    { planId: plan.id }
  );
}

export const actions = {
  resetDemo(): Result {
    return mutate((draft) => {
      const fresh = seed();
      draft.seq = fresh.seq;
      draft.cylinders = fresh.cylinders;
      draft.inspections = fresh.inspections;
      draft.plans = fresh.plans;
      draft.rejections = fresh.rejections;
      draft.events = fresh.events;
    });
  },

  registerCylinder(input: {
    id: string;
    volume: string;
    workingPressure: number;
  }): Result {
    const id = input.id.trim();
    const volume = input.volume.trim();
    if (!id) return { ok: false, error: "气瓶编号必填" };
    if (!volume) return { ok: false, error: "容积必填" };
    if (!(input.workingPressure > 0))
      return { ok: false, error: "工作压力须大于 0" };
    return mutate((s) => {
      if (s.cylinders.some((c) => c.id === id))
        throw new Error("气瓶编号已存在");
      s.cylinders.push({
        id,
        volume,
        workingPressure: input.workingPressure,
        version: 1,
        registeredAt: Date.now(),
      });
      pushEvent(s, id, 1, "register", `登记气瓶 ${volume} / 工作压力 ${input.workingPressure}bar`);
      return { ok: true, id };
    });
  },

  // 信息更正：旧检验立即失效（superseded），排队计划作废，按新版本重算
  correctCylinder(
    id: string,
    patch: { volume: string; workingPressure: number }
  ): Result {
    const volume = patch.volume.trim();
    if (!volume) return { ok: false, error: "容积必填" };
    if (!(patch.workingPressure > 0))
      return { ok: false, error: "工作压力须大于 0" };
    return mutate((s) => {
      const cy = s.cylinders.find((c) => c.id === id);
      if (!cy) throw new Error("气瓶不存在");
      if (cy.volume === volume && cy.workingPressure === patch.workingPressure)
        throw new Error("信息未发生变化");
      const oldVersion = cy.version;
      const oldActive = activeInspectionOf(s, id, oldVersion);
      if (oldActive) oldActive.superseded = true;
      const queued = queuedPlansOf(s, id, oldVersion);
      for (const p of queued) {
        p.status = "voided";
        p.voidedAt = Date.now();
        p.voidReason = `气瓶信息更正（v${oldVersion}→v${oldVersion + 1}），旧检验与排队资格失效`;
        pushEvent(
          s,
          id,
          oldVersion,
          "plan-void",
          `充填计划 ${p.id} 因气瓶信息更合作废留档`,
          { planId: p.id }
        );
      }
      cy.version = oldVersion + 1;
      cy.volume = volume;
      cy.workingPressure = patch.workingPressure;
      pushEvent(
        s,
        id,
        cy.version,
        "correct",
        `气瓶信息更正：${oldActive ? "旧检验单失效，" : ""}按新记录重新检验排队（v${oldVersion}→v${cy.version}）`
      );
    });
  },

  // 登记检验单（含复检）。每瓶每版本仅一条有效单：新单自动替代旧单。
  registerInspection(cylinderId: string, input: InspectionInput): Result {
    if (!input.date.trim())
      return { ok: false, error: "检验日期必填，无法登记检验单" };
    return mutate((s) => {
      const cy = s.cylinders.find((c) => c.id === cylinderId);
      if (!cy) throw new Error("气瓶不存在");

      const ev = evaluateInspection(input, cy.workingPressure);
      const prevActive = activeInspectionOf(s, cylinderId, cy.version);
      const reinspection =
        isReinspection(s, cylinderId, cy.version) || !!prevActive;
      const openBefore = openRejectionOf(s, cylinderId, cy.version);

      if (prevActive) prevActive.superseded = true;

      const insp: Inspection = {
        id: nextId("IN"),
        cylinderId,
        version: cy.version,
        date: input.date.trim(),
        testPressure: input.testPressure,
        residualDeformation: input.residualDeformation,
        inspector: input.inspector.trim(),
        approver: "",
        result: ev.result,
        reasons: ev.result === "reject" ? ev.reasons : [],
        superseded: false,
        restoredQueue: false,
        createdAt: Date.now(),
      };
      s.inspections.push(insp);

      if (ev.result === "reject") {
        // 拒充：已有充填计划全部作废并留档
        const queued = queuedPlansOf(s, cylinderId, cy.version);
        const planIds: string[] = [];
        for (const p of queued) {
          p.status = "voided";
          p.voidedAt = Date.now();
          p.voidReason = `拒充：${ev.reasons.join("、")}`;
          planIds.push(p.id);
          pushEvent(
            s,
            cylinderId,
            cy.version,
            "plan-void",
            `充填计划 ${p.id} 因${ev.reasons.join("、")}作废并留档`,
            { planId: p.id }
          );
        }
        const rec: RejectionRecord = {
          id: nextId("RJ"),
          cylinderId,
          version: cy.version,
          inspectionId: insp.id,
          date: insp.date,
          reasons: ev.reasons,
          inspector: insp.inspector,
          voidedPlanIds: planIds,
          resolved: false,
          createdAt: Date.now(),
        };
        s.rejections.push(rec);
        pushEvent(
          s,
          cylinderId,
          cy.version,
          "inspection-reject",
          `水压 ${insp.testPressure || "—"}bar（要求 ≥${ev.requiredPressure}bar）、变形率 ${
            insp.residualDeformation || "—"
          }%，判定拒充：${ev.reasons.join("、")}`,
          { inspectionId: insp.id, rejectionId: rec.id }
        );
        pushEvent(
          s,
          cylinderId,
          cy.version,
          "reject-fill",
          `拒充登记：${ev.reasons.join("、")}（检验员：${
            insp.inspector || "缺失" }）；复检合格且异员审批后方可恢复排队`,
          { inspectionId: insp.id, rejectionId: rec.id }
        );
        return { ok: true, id: insp.id };
      }

      // 合格单
      const needsApproval = reinspection || !!openBefore;
      pushEvent(
        s,
        cylinderId,
        cy.version,
        "inspection-pass",
        `水压 ${input.testPressure}bar、残余变形率 ${input.residualDeformation}%，检验合格（检验员 ${input.inspector.trim()}）${
          needsApproval ? "，属复检须异员审批" : ""
        }`,
        { inspectionId: insp.id }
      );

      if (!needsApproval) {
        insp.restoredQueue = true;
        return { ok: true, id: insp.id };
      }

      // 复检合格：登记时可一并审批；审批人缺失/同人则保持待审批
      if (input.approver.trim()) {
        const chk = checkApproval(input.inspector, input.approver);
        if (!chk.ok) throw new Error(chk.reason);
        insp.approver = input.approver.trim();
        insp.restoredQueue = true;
        for (const r of s.rejections) {
          if (r.cylinderId === cylinderId && r.version === cy.version && !r.resolved)
            r.resolved = true;
        }
        pushEvent(
          s,
          cylinderId,
          cy.version,
          "restore",
          `审批人 ${insp.approver}（与检验员不同）审批通过，拒充核销，恢复排队`,
          { inspectionId: insp.id }
        );
        restoreLastVoidedPlan(s, cylinderId, cy.version);
      } else {
        pushEvent(
          s,
          cylinderId,
          cy.version,
          "approval-blocked",
          "复检合格，等待与检验员不同的审批人审批后恢复排队",
          { inspectionId: insp.id }
        );
      }
      return { ok: true, id: insp.id };
    });
  },

  // 事后审批恢复
  approveInspection(inspectionId: string, approver: string): Result {
    return mutate((s) => {
      const insp = s.inspections.find((i) => i.id === inspectionId);
      if (!insp) throw new Error("检验单不存在");
      if (insp.superseded) throw new Error("该检验单已被新单替代");
      if (insp.result !== "pass") throw new Error("仅合格检验单可审批恢复");
      if (insp.restoredQueue) throw new Error("该检验单已审批并恢复排队");
      const chk = checkApproval(insp.inspector, approver);
      if (!chk.ok) throw new Error(chk.reason);
      insp.approver = approver.trim();
      insp.restoredQueue = true;
      for (const r of s.rejections) {
        if (
          r.cylinderId === insp.cylinderId &&
          r.version === insp.version &&
          !r.resolved
        )
          r.resolved = true;
      }
      pushEvent(
        s,
        insp.cylinderId,
        insp.version,
        "restore",
        `审批人 ${insp.approver}（检验员 ${insp.inspector}）审批通过，拒充核销，恢复排队`,
        { inspectionId: insp.id }
      );
      restoreLastVoidedPlan(s, insp.cylinderId, insp.version);
    });
  },

  createPlan(cylinderId: string, input: PlanInput): Result {
    if (!input.operator.trim())
      return { ok: false, error: "操作员必填" };
    if (!(input.residualPressure >= 0))
      return { ok: false, error: "残压须为不小于 0 的数值" };
    if (!(input.targetPressure > 0))
      return { ok: false, error: "目标压力须大于 0" };
    if (input.targetPressure <= input.residualPressure)
      return { ok: false, error: "目标压力须高于残压" };
    if (input.o2 < 0 || input.he < 0 || input.o2 + input.he > 100)
      return { ok: false, error: mixHint(input.o2, input.he) };
    return mutate((s) => {
      const cy = s.cylinders.find((c) => c.id === cylinderId);
      if (!cy) throw new Error("气瓶不存在");
      const elig = eligibilityOf(s, cylinderId, cy.version);
      if (!elig.eligible) {
        const map: Record<string, string> = {
          uninspected: "尚无有效检验单，不能排队",
          rejected: `检验不合格（${elig.reasons.join("、")}），只能拒充`,
          "pending-approval": "复检合格但待异员审批，暂不能排队",
          stale: "气瓶信息已更正，资格失效，须重新检验",
        };
        throw new Error(map[elig.status] ?? "当前不具备排队资格");
      }
      const plan: FillPlan = {
        id: nextId("PL"),
        cylinderId,
        version: cy.version,
        residualPressure: input.residualPressure,
        targetPressure: input.targetPressure,
        o2: input.o2,
        he: input.he,
        mode: input.mode,
        operator: input.operator.trim(),
        status: "queued",
        createdAt: Date.now(),
      };
      s.plans.push(plan);
      pushEvent(
        s,
        cylinderId,
        cy.version,
        "enqueue",
        `${input.mode} 充填计划入队：${input.residualPressure}→${input.targetPressure}bar，O₂ ${input.o2}%${
          input.he ? ` / He ${input.he}%` : ""
        }（操作员 ${input.operator.trim()}）`,
        { planId: plan.id }
      );
      return { ok: true, id: plan.id };
    });
  },

  completePlan(planId: string, signOff: string): Result {
    if (!signOff.trim()) return { ok: false, error: "签收人必填" };
    return mutate((s) => {
      const plan = s.plans.find((p) => p.id === planId);
      if (!plan) throw new Error("充填计划不存在");
      if (plan.status !== "queued") throw new Error("该计划不在排队中");
      const cy = s.cylinders.find((c) => c.id === plan.cylinderId);
      if (!cy || cy.version !== plan.version)
        throw new Error("气瓶信息已变更，该计划资格失效");
      const elig = eligibilityOf(s, plan.cylinderId, cy.version);
      if (!elig.eligible) throw new Error("检验资格已不满足，禁止充填签收");
      plan.status = "completed";
      plan.completedAt = Date.now();
      plan.signOff = signOff.trim();
      pushEvent(
        s,
        plan.cylinderId,
        cy.version,
        "complete",
        `${plan.mode} 充填完成（${plan.residualPressure}→${plan.targetPressure}bar），签收人：${signOff.trim()}`,
        { planId: plan.id }
      );
    });
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return state;
}

export function useStore(): Persisted {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

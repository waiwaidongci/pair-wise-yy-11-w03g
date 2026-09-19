// 领域模型：气瓶、检验单、充填计划、拒充记录、履历事件
// 本文件只描述数据结构，不包含任何存储或界面逻辑。

export type Cylinder = {
  id: string; // 气瓶编号
  volume: string; // 容积描述，如 12L铝瓶
  workingPressure: number; // 公称工作压力（bar）
  version: number; // 信息版本：每次更正 +1，旧检验/排队资格随之失效
  registeredAt: number;
};

export type InspectionResult = "pass" | "reject";

export type Inspection = {
  id: string;
  cylinderId: string;
  version: number; // 登记时气瓶信息版本
  date: string; // 检验日期 YYYY-MM-DD
  testPressure: number | null; // 水压值（bar），拒充时可能未登记
  residualDeformation: number | null; // 残余变形率（%），拒充时可能未登记
  inspector: string; // 检验员
  approver: string; // 审批人（复检恢复排队时必填，且须与检验员不同）
  result: InspectionResult;
  reasons: string[]; // 拒充/不合格原因
  superseded: boolean; // 是否被更新检验单替代（每瓶仅一条有效检验单）
  restoredQueue: boolean; // 复检合格并审批后是否已恢复排队
  createdAt: number;
};

export type PlanStatus = "queued" | "voided" | "completed";

export type FillPlan = {
  id: string;
  cylinderId: string;
  version: number; // 建单时气瓶信息版本
  residualPressure: number; // 残压 bar
  targetPressure: number; // 目标压力 bar
  o2: number; // 氧含量 %
  he: number; // 氦含量 %
  mode: string; // 充填方式
  operator: string; // 操作员
  status: PlanStatus;
  createdAt: number;
  voidedAt?: number;
  voidReason?: string; // 作废原因（作废后留档）
  requeuedFrom?: string; // 恢复排队时来源的原作废单ID
  completedAt?: number;
  signOff?: string; // 完成签收人
};

export type RejectionRecord = {
  id: string;
  cylinderId: string;
  version: number;
  inspectionId: string;
  date: string;
  reasons: string[];
  inspector: string;
  voidedPlanIds: string[]; // 同步作废留档的充填计划
  resolved: boolean; // 复检合格且审批通过后核销
  createdAt: number;
};

export type HistoryKind =
  | "register"
  | "correct"
  | "inspection-pass"
  | "inspection-reject"
  | "reject-fill"
  | "plan-void"
  | "enqueue"
  | "restore"
  | "approval-blocked"
  | "complete";

export type HistoryEvent = {
  id: string;
  cylinderId: string;
  version: number;
  kind: HistoryKind;
  at: number;
  detail: string;
  refs?: {
    inspectionId?: string;
    planId?: string;
    rejectionId?: string;
  };
};

// 规则层只读的状态结构（存储层负责实现该结构的持久化）
export type DomainState = {
  cylinders: Cylinder[];
  inspections: Inspection[];
  plans: FillPlan[];
  rejections: RejectionRecord[];
  events: HistoryEvent[];
};

export type InspectionInput = {
  date: string;
  testPressure: number | null;
  residualDeformation: number | null;
  inspector: string;
  approver: string;
};

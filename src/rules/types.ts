// 领域模型：气瓶、水压检验单、充填计划、拒充记录、履历事件

export type TestStatus = "awaiting" | "approved" | "rejected" | "superseded";
export type PlanStatus = "queued" | "signed" | "void";
export type GasMode = "空气" | "高氧" | "Trimix";

export interface Cylinder {
  id: string;
  code: string; // 气瓶编号
  volume: string; // 容积描述，如 12L
  material: string; // 材质，如 铝瓶
  workingPressure: number; // 公称工作压力 bar
  createdAt: string;
  updatedAt: string;
  revision: number; // 信息更正版本号，更正一次 +1
}

export interface HydroTest {
  id: string;
  cylinderId: string;
  testDate: string; // 检验日期 YYYY-MM-DD
  testPressure: number; // 水压试验压力 bar
  residualDeformationRate: number; // 残余变形率 %
  inspector: string; // 检验员
  approver?: string; // 审批人（复检合格恢复排队时必须与检验员不同）
  status: TestStatus;
  tankRevision: number; // 登记检验时气瓶信息版本
  rejectionId?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface FillPlan {
  id: string;
  cylinderId: string;
  mode: GasMode;
  oxygen: number; // 氧含量 %
  helium: number; // 氦含量 %
  targetPressure: number; // 目标压力 bar
  operator: string;
  status: PlanStatus;
  createdAt: string;
  signedAt?: string;
  voidReason?: string;
  archive?: boolean; // 作废后留档
}

export interface RejectionRecord {
  id: string;
  cylinderId: string;
  testId: string;
  reasons: string[]; // 拒充原因
  voidedPlanIds: string[]; // 同步作废的充填计划
  createdAt: string;
  resolvedAt?: string;
  resolveTestId?: string;
}

export interface AuditEvent {
  id: string;
  cylinderId: string;
  at: string;
  kind: string;
  detail: string;
}

export interface AppState {
  cylinders: Cylinder[];
  tests: HydroTest[];
  plans: FillPlan[];
  rejections: RejectionRecord[];
  events: AuditEvent[];
  seq: number;
}

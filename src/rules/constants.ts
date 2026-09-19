// 业务常量（阈值可按门店标准调整）

export const HYDRAULIC_RATIO = 1.5; // 水压试验压力 ≥ 公称工作压力 × 1.5
export const MAX_RESIDUAL_DEFORMATION = 10; // 残余变形率上限 10%

export const FILL_MODES = ["空气", "高氧 EAN32", "高氧 EAN36", "Trimix 18/45", "Trimix 21/35"];

// 拒充原因编码（规则判定与界面提示共用）
export const REASON = {
  DATE_MISSING: "检验日期缺失",
  PRESSURE_LOW: "水压不足",
  DEFORMATION_HIGH: "残余变形率超标",
  INSPECTOR_MISSING: "检验员缺失（人员缺失）",
} as const;

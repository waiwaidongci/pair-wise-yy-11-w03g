// 种子数据：全部通过规则引擎写入，保证与业务规则一致

import { AppState } from "../rules/types";
import {
  addCylinder,
  approveTest,
  correctCylinder,
  enqueue,
  registerTest,
  signOff,
} from "../rules/engine";

export function seedState(initial: AppState): AppState {
  let s = initial;

  // 1) TANK-204：审批合格、正在排队
  s = addCylinder(s, { code: "TANK-204", volume: "12L", material: "铝瓶", workingPressure: 200 });
  let id = s.cylinders[0].id;
  s = registerTest(s, id, {
    testDate: "2026-08-10",
    testPressure: 336,
    residualDeformationRate: 4.2,
    inspector: "王涛",
  });
  s = approveTest(s, s.tests.find((t) => t.cylinderId === id && t.status === "awaiting")!.id, "李静");
  s = enqueue(s, id, { mode: "空气", oxygen: 21, helium: 0, targetPressure: 200, operator: "赵磊" });

  // 2) TANK-219：曾合格排队，复检水压不足被拒充，旧计划作废留档
  s = addCylinder(s, { code: "TANK-219", volume: "11L", material: "钢瓶", workingPressure: 232 });
  id = s.cylinders[1].id;
  s = registerTest(s, id, {
    testDate: "2025-11-02",
    testPressure: 390,
    residualDeformationRate: 5.1,
    inspector: "王涛",
  });
  s = approveTest(s, s.tests.find((t) => t.cylinderId === id && t.status === "awaiting")!.id, "李静");
  s = enqueue(s, id, { mode: "高氧", oxygen: 32, helium: 0, targetPressure: 220, operator: "周敏" });
  s = registerTest(s, id, {
    testDate: "2026-09-12",
    testPressure: 352,
    residualDeformationRate: 8.4,
    inspector: "王涛",
  }); // 须≥387bar → 拒充，原 EAN32 计划作废留档

  // 3) TANK-231：检验合格待复检审批（审批人须不同于检验员）
  s = addCylinder(s, { code: "TANK-231", volume: "双瓶2×12L", material: "钢瓶", workingPressure: 207 });
  id = s.cylinders[2].id;
  s = registerTest(s, id, {
    testDate: "2026-09-15",
    testPressure: 346,
    residualDeformationRate: 3.6,
    inspector: "陈强",
  });

  // 4) TANK-308：信息更正后旧检验与排队资格失效，须按新记录重检
  s = addCylinder(s, { code: "TANK-308", volume: "12L", material: "钢瓶", workingPressure: 200 });
  id = s.cylinders[3].id;
  s = registerTest(s, id, {
    testDate: "2026-06-20",
    testPressure: 335,
    residualDeformationRate: 6.8,
    inspector: "陈强",
  });
  s = approveTest(s, s.tests.find((t) => t.cylinderId === id && t.status === "awaiting")!.id, "李静");
  s = enqueue(s, id, { mode: "Trimix", oxygen: 18, helium:  45, targetPressure: 200, operator: "赵磊" });
  s = correctCylinder(s, id, { code: "TANK-308", volume: "12.2L", material: "钢瓶", workingPressure: 232 });

  // 5) TANK-277：全流程完成已签收
  s = addCylinder(s, { code: "TANK-277", volume: "15L", material: "钢瓶", workingPressure: 232 });
  id = s.cylinders[4].id;
  s = registerTest(s, id, {
    testDate: "2026-05-08",
    testPressure: 392,
    residualDeformationRate: 2.9,
    inspector: "王涛",
  });
  s = approveTest(s, s.tests.find((t) => t.cylinderId === id && t.status === "awaiting")!.id, "陈强");
  s = enqueue(s, id, { mode: "空气", oxygen: 21, helium: 0, targetPressure: 230, operator: "周敏" });
  const plan = s.plans.find((p) => p.cylinderId === id && p.status === "queued")!;
  s = signOff(s, plan.id);

  return s;
}

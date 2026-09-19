// 临时规则引擎不变量验证（不随产物发布）
import {
  addCylinder,
  approveTest,
  correctCylinder,
  cylinderHistory,
  eligibility,
  emptyState,
  enqueue,
  activeTest,
  registerTest,
  signOff,
} from "./engine";

let pass = 0;
function check(name: string, cond: boolean) {
  if (!cond) throw new Error("断言失败: " + name);
  pass++;
  console.log("✓", name);
}
function throws(name: string, fn: () => unknown, frag?: string) {
  try {
    fn();
    throw new Error("断言失败（应抛错）: " + name);
  } catch (e) {
    if (frag && !String((e as Error).message).includes(frag)) throw e;
    pass++;
    console.log("✓", name, "→", (e as Error).message);
  }
}

let s = emptyState();
s = addCylinder(s, { code: "T1", volume: "12L", material: "钢瓶", workingPressure: 200 });
const id1 = s.cylinders[0].id;

// 无检验单不能排队
check("无检验单不可排队", !eligibility(s, id1).canQueue);
throws("无单排队抛错", () => enqueue(s, id1, { mode: "空气", oxygen: 21, helium: 0, targetPressure: 200, operator: "甲" }));

// 登记合格单（336 ≥ 333.3，变形率 4%）
s = registerTest(s, id1, { testDate: "2026-09-01", testPressure: 336, residualDeformationRate: 4, inspector: "王涛" });
check("合格单待审批", activeTest(s, id1)!.status === "awaiting");
check("待审批不可排队", !eligibility(s, id1).canQueue);

// 每瓶仅一条有效单：再次登记，旧单 superseded
s = registerTest(s, id1, { testDate: "2026-09-02", testPressure: 340, residualDeformationRate: 3, inspector: "王涛" });
check("仅一条有效单", s.tests.filter((t) => t.cylinderId === id1 && t.status !== "superseded").length === 1);

// 审批人缺失/相同
throws("审批人缺失", () => approveTest(s, activeTest(s, id1)!.id, "  "), "审批人缺失");
throws("审批人与检验员相同", () => approveTest(s, activeTest(s, id1)!.id, "王涛"), "不同");

// 异员审批 → 可排队 → 入队
s = approveTest(s, activeTest(s, id1)!.id, "李静");
check("异员审批后可排队", eligibility(s, id1).canQueue);
s = enqueue(s, id1, { mode: "空气", oxygen: 21, helium: 0, targetPressure: 200, operator: "赵磊" });
check("在队 1 条", s.plans.filter((p) => p.status === "queued").length === 1);
throws("重复入队", () => enqueue(s, id1, { mode: "空气", oxygen: 21, helium: 0, targetPressure: 200, operator: "赵磊" }));

// 复检不合格：水压不足（300 < 333.3）→ 拒充 + 计划作废留档
s = registerTest(s, id1, { testDate: "2026-09-10", testPressure: 300, residualDeformationRate: 4, inspector: "王涛" });
check("水压不足→拒充", activeTest(s, id1)!.status === "rejected");
check("拒充后不可排队", !eligibility(s, id1).canQueue);
check("拒充记录 1 条且未闭环", s.rejections.filter((r) => !r.resolvedAt).length === 1);
check("旧计划已作废留档", s.plans[0].status === "void" && s.plans[0].archive === true);
check("拒充原因含水压不足", s.rejections[0].reasons.join().includes("水压不足"));

// 变形率超标拒充（registerTest 不抛错，拒充是结果状态）
s = registerTest(s, id1, { testDate: "2026-09-11", testPressure: 340, residualDeformationRate: 11, inspector: "王涛" });
check("变形率超标→rejected", activeTest(s, id1)!.status === "rejected");

// 检验员缺失拒充
s = registerTest(s, id1, { testDate: "2026-09-12", testPressure: 340, residualDeformationRate: 4, inspector: "  " });
check("人员缺失→rejected", activeTest(s, id1)!.status === "rejected");
check("拒充原因含检验员缺失", s.rejections[s.rejections.length - 1].reasons.join().includes("检验员缺失"));

// 重新合格 + 异员审批 → 拒充闭环、排队恢复（留档计划复制回队）
s = registerTest(s, id1, { testDate: "2026-09-13", testPressure: 340, residualDeformationRate: 3, inspector: "陈强" });
s = approveTest(s, activeTest(s, id1)!.id, "李静");
check("复检后可排队", eligibility(s, id1).canQueue);
check("历史拒充全部闭环", s.rejections.every((r) => !!r.resolvedAt));
check("恢复排队生成新在队计划", s.plans.filter((p) => p.status === "queued").length === 1);
check("作废计划仍留档", s.plans.filter((p) => p.archive && p.status === "void").length >= 1);

// 第二只瓶：信息更正 → 旧检验失效、计划作废、资格重算
s = addCylinder(s, { code: "T2", volume: "11L", material: "铝瓶", workingPressure: 200 });
const id2 = s.cylinders[1].id;
s = registerTest(s, id2, { testDate: "2026-08-01", testPressure: 336, residualDeformationRate: 4, inspector: "王涛" });
s = approveTest(s, activeTest(s, id2)!.id, "李静");
s = enqueue(s, id2, { mode: "高氧", oxygen: 32, helium: 0, targetPressure: 200, operator: "周敏" });
s = correctCylinder(s, id2, { code: "T2", volume: "11L", material: "铝瓶", workingPressure: 232 });
check("更正后 revision=2", s.cylinders[1].revision === 2);
check("更正后旧检验失效", activeTest(s, id2) === undefined);
check("更正后须重检不可排队", !eligibility(s, id2).canQueue && eligibility(s, id2).reasons.join().includes("尚无有效检验单"));
check("更正后在队计划作废留档", s.plans.filter((p) => p.cylinderId === id2 && p.status === "void" && p.archive).length === 1);
// 按新工作压力，336 已不达标（须 ≥ 386.7）
s = registerTest(s, id2, { testDate: "2026-09-15", testPressure: 336, residualDeformationRate: 4, inspector: "王涛" });
check("新记录下旧水压值被判不足→拒充", activeTest(s, id2)!.status === "rejected");
s = registerTest(s, id2, { testDate: "2026-09-16", testPressure: 390, residualDeformationRate: 4, inspector: "王涛" });
s = approveTest(s, activeTest(s, id2)!.id, "陈强");
check("新记录复检合格后恢复可排队", eligibility(s, id2).canQueue);

// 过期审批单不可排队
s = registerTest(s, id2, { testDate: "2024-01-01", testPressure: 390, residualDeformationRate: 4, inspector: "王涛" });
s = approveTest(s, activeTest(s, id2)!.id, "陈强");
check("检验过期不可排队", !eligibility(s, id2).canQueue && eligibility(s, id2).reasons.join().includes("到期"));

// 混合气校验
s = registerTest(s, id2, { testDate: "2026-09-01", testPressure: 390, residualDeformationRate: 4, inspector: "王涛" });
s = approveTest(s, activeTest(s, id2)!.id, "陈强");
// id2 当前已有恢复出的在队计划，先签收
s = signOff(s, s.plans.find((p) => p.cylinderId === id2 && p.status === "queued")!.id);
throws("空气氧含量非21", () => enqueue(s, id2, { mode: "空气", oxygen: 32, helium: 0, targetPressure: 200, operator: "甲" }), "空气");
throws("Trimix 氦为0", () => enqueue(s, id2, { mode: "Trimix", oxygen: 18, helium: 0, targetPressure: 200, operator: "甲" }), "Trimix");

// 履历完整
const hist = cylinderHistory(s, id1);
check("单瓶履历含拒充与复检", hist.some((h) => h.kind === "拒充") && hist.some((h) => h.kind === "复检通过"));

console.log(`\n全部 ${pass} 项断言通过`);

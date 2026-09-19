import { AppState } from "../rules/types";
import { fmtTime } from "./StageBadge";

/** 拒充记录台：含作废留档的充填计划清单与闭环状态 */
export default function RejectionPanel({ state }: { state: AppState }) {
  const rows = [...state.rejections].reverse();

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>安全红线留痕</p>
          <h2>拒充记录（{rows.length}）</h2>
        </div>
      </div>
      <div className="rej-list">
        {rows.map((r) => {
          const c = state.cylinders.find((x) => x.id === r.cylinderId);
          const test = state.tests.find((t) => t.id === r.testId);
          const voided = state.plans.filter((p) => r.voidedPlanIds.includes(p.id));
          return (
            <article key={r.id} className={`rej-row ${r.resolvedAt ? "closed" : "open"}`}>
              <div className="rej-head">
                <h3>{c?.code ?? "未知气瓶"}</h3>
                <span className={`pill ${r.resolvedAt ? "pill-ok" : "pill-bad"}`}>
                  {r.resolvedAt ? "已闭环 · 复检恢复" : "拒充中"}
                </span>
              </div>
              <p className="sub">{fmtTime(r.createdAt)} 拒充</p>
              <ul className="reasons">
                {r.reasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {test && (
                <p className="sub">
                  检验单：{test.testDate} 水压 {test.testPressure}bar / 变形率{" "}
                  {test.residualDeformationRate}% / 检验员 {test.inspector}
                </p>
              )}
              {voided.length > 0 && (
                <div className="archive-box">
                  <b>作废留档充填计划（{voided.length}）：</b>
                  {voided.map((p) => (
                    <p key={p.id} className="sub">
                      · {p.mode} 目标 {p.targetPressure}bar / {p.operator} —— {p.voidReason}
                    </p>
                  ))}
                </div>
              )}
              {r.resolvedAt && (
                <p className="sub ok-text">
                  ✓ {fmtTime(r.resolvedAt)} 复检合格并经异员审批，排队资格恢复
                </p>
              )}
            </article>
          );
        })}
        {rows.length === 0 && <p className="empty">暂无拒充记录</p>}
      </div>
    </section>
  );
}

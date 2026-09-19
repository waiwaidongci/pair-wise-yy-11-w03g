// 拒充记录：未核销优先；复检合格且异员审批后自动核销。
// 全部记录留档可查（含因信息更正而不再约束当前版本的旧记录）。
import { useMemo, useState } from "react";
import { DomainState } from "../rules/types";
import { fmtTime } from "./format";

export default function RejectionPanel({
  state,
  onSelect,
}: {
  state: DomainState;
  onSelect: (id: string) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const records = useMemo(
    () =>
      [...state.rejections]
        .filter((r) => showResolved || !r.resolved)
        .sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt - a.createdAt),
    [state.rejections, showResolved]
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>拒充记录</p>
          <h2>水压检验拒充台账</h2>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
          />
          含已核销/历史记录
        </label>
      </div>

      {records.length === 0 && <p className="sub">当前没有符合条件的拒充记录。</p>}

      <div className="rej-list">
        {records.map((r) => {
          const voided = state.plans.filter((p) => r.voidedPlanIds.includes(p.id));
          return (
            <article key={r.id} className={`rej-row ${r.resolved ? "resolved" : ""}`}>
              <div className="plan-head">
                <button className="link" onClick={() => onSelect(r.cylinderId)}>
                  {r.cylinderId}
                </button>
                <em className="ver">v{r.version}</em>
                <span className={`badge ${r.resolved ? "muted" : "bad"}`}>
                  {r.resolved ? "已核销（复检恢复）" : "未核销 · 禁止充填"}
                </span>
              </div>
              <p className="sub">
                检验单 {r.inspectionId} · {r.date} · 检验员 {r.inspector || "缺失"} · 登记于{" "}
                {fmtTime(r.createdAt)}
              </p>
              <p className="rej-reasons">原因：{r.reasons.join("、") || "（见检验单）"}</p>
              {voided.length > 0 && (
                <p className="sub">
                  同步作废留档：
                  {voided.map((p) => `${p.id}（${p.mode}）`).join("，")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

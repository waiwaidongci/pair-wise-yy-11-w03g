// 待充填队列：仅展示具备有效资格的排队计划；混合气比例实时提示；完成须签收。
// 已作废计划（拒充/信息更正导致）保留留档展示，不再可操作。
import { useMemo, useState } from "react";
import { Cylinder, DomainState, FillPlan } from "../rules/types";
import { FILL_MODES } from "../rules/constants";
import { mixHint, planEligibility } from "../rules/engine";
import { actions, PlanInput } from "../store/store";
import { fmtTime, planStatusLabel } from "./format";
import { NoticeBar, useAction } from "./useAction";

export default function QueuePanel({
  state,
  cylinders,
  selectedId,
  onSelect,
}: {
  state: DomainState;
  cylinders: Cylinder[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { notice, run, setNotice } = useAction();
  const [residual, setResidual] = useState("50");
  const [target, setTarget] = useState("200");
  const [o2, setO2] = useState("21");
  const [he, setHe] = useState("0");
  const [mode, setMode] = useState(FILL_MODES[0]);
  const [operator, setOperator] = useState("");
  const [signFor, setSignFor] = useState<string | null>(null);
  const [signName, setSignName] = useState("");

  const cy = cylinders.find((c) => c.id === selectedId);
  const hint = mixHint(Number(o2) || 0, Number(he) || 0);

  const sorted = useMemo(
    () =>
      [...state.plans].sort((a, b) => {
        const rank = (p: FillPlan) =>
          p.status === "queued" ? 0 : p.status === "voided" ? 1 : 2;
        return rank(a) - rank(b) || a.createdAt - b.createdAt;
      }),
    [state.plans]
  );
  const nameOf = (id: string) => state.cylinders.find((c) => c.id === id);

  const enqueue = () => {
    if (!cy) return;
    const input: PlanInput = {
      residualPressure: Number(residual),
      targetPressure: Number(target),
      o2: Number(o2),
      he: Number(he),
      mode,
      operator,
    };
    if (run(() => actions.createPlan(cy.id, input)).ok) {
      setOperator("");
      setNotice({ ok: true, text: `${cy.id} 已排入待充填队列` });
    }
  };

  const sign = (planId: string) => {
    if (run(() => actions.completePlan(planId, signName)).ok) {
      setSignFor(null);
      setSignName("");
      setNotice({ ok: true, text: "充填完成并签收" });
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>待充填队列</p>
          <h2>排队 · 作废留档 · 完成签收</h2>
        </div>
        <strong className="count">{state.plans.filter((p) => p.status === "queued").length} 单排队</strong>
      </div>
      <NoticeBar notice={notice} />

      <div className="enqueue-box">
        <p className="sub">
          为 <b>{selectedId}</b> 建立充填计划（须先有合格有效检验单；拒充/待审批气瓶无法入队）
        </p>
        <div className="field-grid">
          <label>
            <span>残压（bar）</span>
            <input type="number" value={residual} onChange={(e) => setResidual(e.target.value)} />
          </label>
          <label>
            <span>目标压力（bar）</span>
            <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <label>
            <span>氧含量 O₂（%）</span>
            <input type="number" value={o2} onChange={(e) => setO2(e.target.value)} />
          </label>
          <label>
            <span>氦含量 He（%）</span>
            <input type="number" value={he} onChange={(e) => setHe(e.target.value)} />
          </label>
          <label>
            <span>充填方式</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {FILL_MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <span>操作员 *</span>
            <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="人员缺失不能建单" />
          </label>
        </div>
        <span className={`mix-hint ${Number(o2) + Number(he) > 100 ? "bad" : ""}`}>
          混合气提示：{hint}
        </span>
        <button className="primary" onClick={enqueue}>
          加入队列
        </button>
      </div>

      <div className="plan-list">
        {sorted.map((p) => {
          const c = nameOf(p.cylinderId);
          const stale = p.status === "queued" && !!c && c.version !== p.version;
          const elig = p.status === "queued" && c ? planEligibility(state, p) : null;
          return (
            <article key={p.id} className={`plan-row ${p.status} ${stale ? "stale" : ""}`}>
              <div className="plan-head">
                <button className="link" onClick={() => onSelect(p.cylinderId)}>
                  {p.cylinderId}
                </button>
                {p.version !== c?.version && <em className="ver">原 v{p.version}</em>}
                <span className={`badge ${p.status === "queued" ? "ok" : p.status === "voided" ? "bad" : "muted"}`}>
                  {planStatusLabel(p.status)}
                </span>
                {p.requeuedFrom && <span className="tag">复检恢复自 {p.requeuedFrom}</span>}
              </div>
              <p className="sub">
                {p.mode} · {p.residualPressure}→{p.targetPressure}bar · O₂ {p.o2}%
                {p.he ? ` / He ${p.he}%` : ""} · 操作员 {p.operator} · {fmtTime(p.createdAt)}
              </p>
              {p.status === "voided" && (
                <p className="void-reason">作废原因：{p.voidReason} · {p.voidedAt && fmtTime(p.voidedAt)}</p>
              )}
              {p.status === "completed" && (
                <p className="sub">完成于 {p.completedAt && fmtTime(p.completedAt)} · 签收人：{p.signOff}</p>
              )}
              {p.status === "queued" && !stale && elig?.eligible && (
                signFor === p.id ? (
                  <div className="sign-box">
                    <input
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      placeholder="签收人（客户/经手人）"
                    />
                    <button className="primary" onClick={() => sign(p.id)}>
                      确认签收
                    </button>
                    <button onClick={() => setSignFor(null)}>取消</button>
                  </div>
                ) : (
                  <button className="mini" onClick={() => setSignFor(p.id)}>
                    充填完成 · 签收
                  </button>
                )
              )}
              {p.status === "queued" && (stale || !elig?.eligible) && (
                <p className="void-reason">该单资格已失效，应已作废（数据异常）</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

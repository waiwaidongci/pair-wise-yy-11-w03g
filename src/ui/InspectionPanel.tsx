// 水压检验台：每只气瓶只能有一条有效检验单（新单替代旧单）。
// 水压不足 / 变形率超标 / 检验员缺失 → 拒充，排队计划自动作废留档；
// 复检合格且审批人与检验员不同 → 核销拒充并恢复排队。
import { useMemo, useState } from "react";
import { Cylinder, DomainState } from "../rules/types";
import {
  activeInspectionOf,
  checkApproval,
  evaluateInspection,
  isReinspection,
  openRejectionOf,
} from "../rules/engine";
import { HYDRAULIC_RATIO, MAX_RESIDUAL_DEFORMATION } from "../rules/constants";
import { actions } from "../store/store";
import { fmtTime } from "./format";
import { NoticeBar, useAction } from "./useAction";

function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function InspectionPanel({
  cylinder,
  state,
}: {
  cylinder: Cylinder;
  state: DomainState;
}) {
  const { notice, run, setNotice } = useAction();
  const [date, setDate] = useState(today());
  const [pressure, setPressure] = useState("");
  const [deformation, setDeformation] = useState("");
  const [inspector, setInspector] = useState("");
  const [approver, setApprover] = useState("");

  const active = activeInspectionOf(state, cylinder.id, cylinder.version);
  const reinspection = isReinspection(state, cylinder.id, cylinder.version);
  const open = openRejectionOf(state, cylinder.id, cylinder.version);

  const required = Math.round(cylinder.workingPressure * HYDRAULIC_RATIO);
  const p = pressure === "" ? null : Number(pressure);
  const d = deformation === "" ? null : Number(deformation);

  const preview = useMemo(
    () =>
      evaluateInspection(
        {
          date,
          testPressure: p,
          residualDeformation: d,
          inspector,
          approver,
        },
        cylinder.workingPressure
      ),
    [date, p, d, inspector, approver, cylinder.workingPressure]
  );

  const approval = inspector.trim()
    ? checkApproval(inspector, approver)
    : { ok: false, reason: "" };

  const submit = () => {
    const r = run(() =>
      actions.registerInspection(cylinder.id, {
        date,
        testPressure: p,
        residualDeformation: d,
        inspector,
        approver,
      })
    );
    if (r.ok) {
      setPressure("");
      setDeformation("");
      setInspector("");
      setApprover("");
      setNotice({
        ok: true,
        text:
          preview.result === "reject"
            ? "已登记拒充，排队中充填计划已作废留档"
            : reinspection || open
              ? approval.ok
                ? "复检合格，审批通过，已恢复排队"
                : "复检合格单已登记，待异员审批后恢复排队"
              : "检验合格，气瓶具备充填排队资格",
      });
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>水压检验与拒充复核台</p>
          <h2>
            检验登记 · {cylinder.id} <em className="ver">v{cylinder.version}</em>
          </h2>
        </div>
      </div>
      <p className="hint">
        试验压力须 ≥ 公称工作压力 ×{HYDRAULIC_RATIO} ={" "}
        <b>{required}bar</b>；残余变形率上限 <b>{MAX_RESIDUAL_DEFORMATION}%</b>。
        新检验单登记后自动替代旧有效单（每瓶仅一条有效单）。
      </p>

      <NoticeBar notice={notice} />

      <div className="field-grid">
        <label>
          <span>检验日期 *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>水压值（bar）*</span>
          <input
            type="number"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder={`不低于 ${required}`}
            className={p != null && p < required ? "input-bad" : ""}
          />
        </label>
        <label>
          <span>残余变形率（%）*</span>
          <input
            type="number"
            step="0.1"
            value={deformation}
            onChange={(e) => setDeformation(e.target.value)}
            placeholder={`不高于 ${MAX_RESIDUAL_DEFORMATION}`}
            className={d != null && d > MAX_RESIDUAL_DEFORMATION ? "input-bad" : ""}
          />
        </label>
        <label>
          <span>检验员 *</span>
          <input
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
            placeholder="人员缺失将只能拒充"
            className={inspector.trim() === "" ? "input-bad" : ""}
          />
        </label>
        <label className="wide">
          <span>
            审批人{reinspection || open ? "（复检恢复必填）" : "（首次检验无需）"}
          </span>
          <input
            value={approver}
            onChange={(e) => setApprover(e.target.value)}
            disabled={!(reinspection || open)}
            placeholder="须与检验员不同的人员"
          />
        </label>
      </div>

      <div className={`preview ${preview.result === "reject" ? "bad" : "good"}`}>
        <b>实时判定：{preview.result === "reject" ? "拒充" : "合格"}</b>
        {preview.result === "reject" ? (
          <span>拒充原因：{preview.reasons.join("、")}；登记后排队中计划立即作废留档</span>
        ) : reinspection || open ? (
          <span>
            属复检：{approval.ok
              ? "审批人符合异员要求，提交后核销拒充并恢复排队"
              : approver.trim()
                ? approval.reason
                : "须填写与检验员不同的审批人方可恢复排队（可先登记后补审批）"}
          </span>
        ) : (
          <span>首次检验合格即可排队充填</span>
        )}
      </div>

      <button className="primary block" onClick={submit}>
        提交检验单
      </button>

      {active && (
        <div className="active-insp">
          <h3>当前有效检验单</h3>
          <table>
            <tbody>
              <tr>
                <th>单号 / 日期</th>
                <td>
                  {active.id} · {active.date} · {fmtTime(active.createdAt)}
                </td>
              </tr>
              <tr>
                <th>水压 / 变形率</th>
                <td>
                  {active.testPressure ?? "—"}bar / {active.residualDeformation ?? "—"}%
                </td>
              </tr>
              <tr>
                <th>检验员 / 审批人</th>
                <td>
                  {active.inspector || "（缺失）"}
                  {active.approver ? ` / ${active.approver}` : " / 待审批"}
                </td>
              </tr>
              <tr>
                <th>结论</th>
                <td>
                  {active.result === "pass" ? (
                    active.restoredQueue ? (
                      <span className="badge ok">合格 · 已恢复排队</span>
                    ) : (
                      <span className="badge warn">合格 · 待异员审批</span>
                    )
                  ) : (
                    <span className="badge bad">拒充：{active.reasons.join("、")}</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {active.result === "pass" && !active.restoredQueue && (
            <ApproveBox inspectionId={active.id} inspector={active.inspector} />
          )}
        </div>
      )}
    </section>
  );
}

function ApproveBox({
  inspectionId,
  inspector,
}: {
  inspectionId: string;
  inspector: string;
}) {
  const { notice, run, setNotice } = useAction();
  const [name, setName] = useState("");
  const chk = checkApproval(inspector, name);
  return (
    <div className="approve-box">
      <NoticeBar notice={notice} />
      <label>
        <span>补录审批人（不得为 {inspector || "检验员本人"}）</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button
        className="primary"
        disabled={!chk.ok}
        title={chk.ok ? "" : chk.reason}
        onClick={() =>
          run(() => actions.approveInspection(inspectionId, name)).ok &&
          (setName(""), setNotice({ ok: true, text: "审批通过，已恢复排队" }))
        }
      >
        审批通过并恢复排队
      </button>
    </div>
  );
}

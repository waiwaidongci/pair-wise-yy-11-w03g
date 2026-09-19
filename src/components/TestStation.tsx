import { useState } from "react";
import { AppState } from "../rules/types";
import {
  activeTest,
  approveTest,
  correctCylinder,
  eligibility,
  evaluateTest,
  registerTest,
} from "../rules/engine";
import { MAX_RESIDUAL_DEFORMATION_RATE, TEST_PRESSURE_FACTOR, todayStr } from "../rules/constants";

interface Props {
  state: AppState;
  selectedId: string | null;
  dispatch: (fn: (prev: AppState) => AppState, ok?: string) => void;
}

/** 水压检验登记 + 复检审批 + 气瓶信息更正 */
export default function TestStation({ state, selectedId, dispatch }: Props) {
  const cyl = state.cylinders.find((c) => c.id === selectedId) ?? null;

  const [date, setDate] = useState(todayStr());
  const [pressure, setPressure] = useState("");
  const [rate, setRate] = useState("");
  const [inspector, setInspector] = useState("");
  const [approver, setApprover] = useState("");
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [volume, setVolume] = useState("");
  const [material, setMaterial] = useState("");
  const [wp, setWp] = useState("");

  if (!cyl) {
    return (
      <section className="panel">
        <p>规则总览</p>
        <h2>水压检验与拒充复核台</h2>
        <ul className="rules">
          <li>每只气瓶只能有一条有效检验单；新单登记后旧单立即留档失效。</li>
          <li>须登记检验日期、水压值、残余变形率、检验员四项。</li>
          <li>
            水压须 ≥ 公称工作压力 × {TEST_PRESSURE_FACTOR.toFixed(2)}，残余变形率 ≤{" "}
            {MAX_RESIDUAL_DEFORMATION_RATE}%；水压不足、变形率超标或检验员缺失，一律拒充。
          </li>
          <li>拒充时已有充填计划一律作废并留档。</li>
          <li>复检合格且审批人与检验员不同，审批后才恢复排队。</li>
          <li>气瓶信息更正后，旧检验单与排队资格立即失效，按新记录重算。</li>
        </ul>
        <p className="empty">← 请先在左侧名册选择一只气瓶</p>
      </section>
    );
  }

  const test = activeTest(state, cyl.id);
  const elg = eligibility(state, cyl.id);
  const required = Math.ceil(cyl.workingPressure * TEST_PRESSURE_FACTOR);
  const preview = evaluateTest(cyl, {
    testPressure: Number(pressure) || 0,
    residualDeformationRate: Number(rate) || 0,
    inspector,
  });
  const outdated = test ? test.tankRevision !== cyl.revision : false;

  const startEdit = () => {
    setEditing(true);
    setCode(cyl.code);
    setVolume(cyl.volume);
    setMaterial(cyl.material);
    setWp(String(cyl.workingPressure));
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>检验 / 复核 / 更正</p>
          <h2>{cyl.code}</h2>
        </div>
        <button onClick={startEdit} disabled={editing}>
          信息更正
        </button>
      </div>

      {editing && (
        <div className="subform warn-box">
          <h3>气瓶信息更正（旧检验与排队资格立即失效）</h3>
          <div className="field-grid">
            <label>
              <span>气瓶编号</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} />
            </label>
            <label>
              <span>容积</span>
              <input value={volume} onChange={(e) => setVolume(e.target.value)} />
            </label>
            <label>
              <span>材质</span>
              <input value={material} onChange={(e) => setMaterial(e.target.value)} />
            </label>
            <label>
              <span>公称工作压力 bar</span>
              <input type="number" value={wp} onChange={(e) => setWp(e.target.value)} />
            </label>
          </div>
          <div className="btn-row">
            <button
              className="danger-btn"
              onClick={() =>
                dispatch(
                  (s) =>
                    correctCylinder(s, cyl.id, {
                      code,
                      volume,
                      material,
                      workingPressure: Number(wp),
                    }),
                  "信息已更正：旧检验单与排队资格失效，须按新记录重检",
                )
              }
            >
              确认更正并重算
            </button>
            <button onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="field-grid">
        <label>
          <span>检验日期</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>检验员</span>
          <input
            placeholder="必填"
            value={inspector}
            onChange={(e) => setInspector(e.target.value)}
          />
        </label>
        <label>
          <span>水压值 bar（须 ≥ {required}）</span>
          <input
            type="number"
            placeholder={`工作压力 ${cyl.workingPressure} × ${TEST_PRESSURE_FACTOR.toFixed(2)}`}
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
          />
        </label>
        <label>
          <span>残余变形率 %（须 ≤ {MAX_RESIDUAL_DEFORMATION_RATE}）</span>
          <input
            type="number"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      </div>

      {(pressure || rate || inspector) && (
        <div className={`verdict ${preview.pass ? "ok" : "bad"}`}>
          {preview.pass ? (
            <>✓ 判定合格，登记后进入「待复检审批」</>
          ) : (
            <>✗ 判定结果：{preview.reasons.join("；")} —— 将拒充并作废旧充填计划</>
          )}
        </div>
      )}

      <div className="btn-row">
        <button
          className="primary"
          onClick={() =>
            dispatch(
              (s) =>
                registerTest(s, cyl.id, {
                  testDate: date,
                  testPressure: Number(pressure),
                  residualDeformationRate: Number(rate),
                  inspector,
                }),
              preview.pass ? "检验单已登记，等待复检审批" : "已拒充，相关充填计划作废留档",
            )
          }
        >
          登记检验单
        </button>
      </div>

      <div className="divider" />

      {test && (
        <div className="subform">
          <h3>复检审批</h3>
          {outdated ? (
            <p className="empty">现有检验单因信息更正已失效，须按新记录重新登记检验。</p>
          ) : test.status === "awaiting" ? (
            <>
              <p className="sub">
                检验员：<b>{test.inspector}</b>。审批人不得缺失，且必须与检验员不同。
              </p>
              <div className="approve-row">
                <input
                  placeholder="审批人姓名"
                  value={approver}
                  onChange={(e) => setApprover(e.target.value)}
                />
                <button
                  className="primary"
                  onClick={() =>
                    dispatch(
                      (s) => approveTest(s, test.id, approver),
                      "复检通过，排队资格恢复",
                    )
                  }
                >
                  审批通过并恢复排队
                </button>
              </div>
              {approver.trim() && approver.trim() === test.inspector && (
                <p className="field-error">审批人与检验员相同，不能审批</p>
              )}
            </>
          ) : (
            <p className="sub">
              当前有效单状态：
              <b>{test.status === "approved" ? "已审批合格" : test.status === "rejected" ? "已拒充" : "已失效"}</b>
              {test.approver ? `，审批人 ${test.approver}` : ""}。
              {test.status === "rejected" && "请重新登记合格检验单后再走复检审批。"}
              {test.status === "approved" && !elg.canQueue && ` ${elg.reasons.join("；")}`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import { AppState, GasMode } from "../rules/types";
import { activePlan, eligibility, enqueue, signOff } from "../rules/engine";
import { cylinderName } from "../storage/storage";

interface Props {
  state: AppState;
  selectedId: string | null;
  dispatch: (fn: (prev: AppState) => AppState, ok?: string) => void;
}

const MODES: GasMode[] = ["空气", "高氧", "Trimix"];

/** 待充填队列：仅检验审批合格在有效期内的气瓶可入队，完成可签收 */
export default function FillQueue({ state, selectedId, dispatch }: Props) {
  const [mode, setMode] = useState<GasMode>("空气");
  const [oxygen, setOxygen] = useState(21);
  const [helium, setHelium] = useState(0);
  const [target, setTarget] = useState(200);
  const [operator, setOperator] = useState("");

  const queued = state.plans.filter((p) => p.status === "queued");
  const signed = state.plans.filter((p) => p.status === "signed");
  const cyl = state.cylinders.find((c) => c.id === selectedId) ?? null;
  const elg = cyl ? eligibility(state, cyl.id) : null;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>充填调度</p>
          <h2>待充填队列（{queued.length}）</h2>
        </div>
      </div>

      {cyl && (
        <div className="subform">
          <h3>为 {cylinderName(cyl)} 排产</h3>
          {elg && !elg.canQueue && (
            <p className="field-error">不可排队：{elg.reasons.join("；")}</p>
          )}
          {elg?.canQueue && activePlan(state, cyl.id) && (
            <p className="field-error">该气瓶已有进行中的充填计划</p>
          )}
          <div className="field-grid">
            <label>
              <span>充填方式</span>
              <select
                value={mode}
                onChange={(e) => {
                  const m = e.target.value as GasMode;
                  setMode(m);
                  if (m === "空气") {
                    setOxygen(21);
                    setHelium(0);
                  } else if (m === "高氧") {
                    setHelium(0);
                  }
                }}
              >
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              <span>目标压力 bar</span>
              <input type="number" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
            </label>
            <label>
              <span>氧含量 %</span>
              <input type="number" step="0.1" value={oxygen} onChange={(e) => setOxygen(Number(e.target.value))} />
            </label>
            <label>
              <span>氦含量 %</span>
              <input
                type="number"
                step="0.1"
                value={helium}
                disabled={mode !== "Trimix"}
                onChange={(e) => setHelium(Number(e.target.value))}
              />
            </label>
            <label>
              <span>操作员</span>
              <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="必填" />
            </label>
          </div>
          <MixHint mode={mode} oxygen={oxygen} helium={helium} />
          <div className="btn-row">
            <button
              className="primary"
              disabled={!elg?.canQueue || !!activePlan(state, cyl.id)}
              onClick={() =>
                dispatch(
                  (s) => enqueue(s, cyl.id, { mode, oxygen, helium, targetPressure: target, operator }),
                  "已排入待充填队列",
                )
              }
            >
              排入队列
            </button>
          </div>
        </div>
      )}

      <div className="queue-list">
        {queued.map((p) => {
          const c = state.cylinders.find((x) => x.id === p.cylinderId);
          return (
            <article key={p.id} className="queue-row">
              <div>
                <h3>{c?.code ?? "已删气瓶"}</h3>
                <p>
                  {p.mode} · O₂ {p.oxygen}%{p.helium ? ` · He ${p.helium}%` : ""} · 目标{" "}
                  {p.targetPressure}bar · 操作员 {p.operator}
                </p>
              </div>
              <button
                onClick={() => dispatch((s) => signOff(s, p.id), "充填完成，已签收")}
              >
                完成签收
              </button>
            </article>
          );
        })}
        {queued.length === 0 && <p className="empty">队列为空</p>}
      </div>

      {signed.length > 0 && (
        <>
          <h3 className="section-sub">近期签收（{signed.length}）</h3>
          <div className="queue-list">
            {signed.slice(-5).reverse().map((p) => {
              const c = state.cylinders.find((x) => x.id === p.cylinderId);
              return (
                <article key={p.id} className="queue-row signed">
                  <div>
                    <h3>{c?.code} ✓ 已签收</h3>
                    <p>
                      {p.mode} · O₂ {p.oxygen}% · {p.targetPressure}bar
                      {p.signedAt ? ` · ${new Date(p.signedAt).toLocaleString("zh-CN")}` : ""}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function MixHint({ mode, oxygen, helium }: { mode: GasMode; oxygen: number; helium: number }) {
  let msg = "";
  let bad = false;
  if (mode === "空气") {
    if (oxygen !== 21 || helium !== 0) {
      bad = true;
      msg = "空气须为 O₂ 21% / He 0%";
    } else msg = "空气充填：O₂ 21%，氮 79%";
  } else if (mode === "高氧") {
    if (oxygen <= 21 || oxygen >= 100 || helium !== 0) {
      bad = true;
      msg = "高氧：21% < O₂ < 100%，He 0%";
    } else msg = `EAN${Math.round(oxygen)}：O₂ ${oxygen}%，氮 ${(100 - oxygen).toFixed(1)}%`;
  } else {
    if (helium <= 0 || oxygen + helium >= 100) {
      bad = true;
      msg = "Trimix：He > 0 且 O₂ + He < 100%";
    } else
      msg = `Trimix：O₂ ${oxygen}% / He ${helium}% / 氮 ${(100 - oxygen - helium).toFixed(1)}%`;
  }
  return <p className={bad ? "field-error" : "mix-hint"}>{msg}</p>;
}

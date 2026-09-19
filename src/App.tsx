import { useMemo, useState } from "react";
import { useStationStore } from "./hooks/useStationStore";
import {
  activeTest,
  eligibility,
  openRejection,
  addCylinder as addCylinderRule,
} from "./rules/engine";
import CylinderRoster from "./components/CylinderRoster";
import TestStation from "./components/TestStation";
import FillQueue from "./components/FillQueue";
import RejectionPanel from "./components/RejectionPanel";
import HistoryPanel from "./components/HistoryPanel";

function App() {
  const { state, error, notice, dispatch, doReset } = useStationStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    state.cylinders[0]?.id ?? null,
  );
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [volume, setVolume] = useState("");
  const [material, setMaterial] = useState("");
  const [wp, setWp] = useState("200");

  const metrics = useMemo(() => {
    const queued = state.plans.filter((p) => p.status === "queued").length;
    const openRej = state.cylinders.filter((c) => openRejection(state, c.id)).length;
    const awaiting = state.cylinders.filter((c) => {
      const t = activeTest(state, c.id);
      return t?.status === "awaiting" && t.tankRevision === c.revision;
    }).length;
    const signed = state.plans.filter((p) => p.status === "signed").length;
    const blocked = state.cylinders.filter((c) => !eligibility(state, c.id).canQueue).length;
    return { queued, openRej, awaiting, signed, blocked };
  }, [state]);

  const createCylinder = () =>
    dispatch(
      (s) => {
        const next = addCylinderRule(s, {
          code,
          volume,
          material,
          workingPressure: Number(wp),
        });
        const created = next.cylinders.find((c) => c.code === code.trim());
        if (created) setSelectedId(created.id);
        return next;
      },
      "气瓶已建档",
    );

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62010 · 潜水气瓶 · Port 62010</p>
        <h1>水压检验与拒充复核台</h1>
        <span>
          每瓶仅一条有效检验单；水压不足、变形率超标或人员缺失即拒充并作废留档充填计划；
          复检合格且审批人与检验员不同方可恢复排队；信息更正后旧检验与排队资格立即失效、按新记录重算。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待充填排队</small>
          <strong>{metrics.queued}</strong>
        </article>
        <article>
          <small>拒充中气瓶</small>
          <strong className="metric-danger">{metrics.openRej}</strong>
        </article>
        <article>
          <small>待复检审批</small>
          <strong className="metric-warn">{metrics.awaiting}</strong>
        </article>
        <article>
          <small>不可排队 / 签收单</small>
          <strong>
            {metrics.blocked}
            <em> / {metrics.signed}</em>
          </strong>
        </article>
      </section>

      {(error || notice) && (
        <div className={`toast ${error ? "toast-error" : "toast-ok"}`}>
          {error ? `✗ ${error}` : `✓ ${notice}`}
        </div>
      )}

      <section className="toolbar">
        <button className="primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "收起建档" : "新增气瓶建档"}
        </button>
        <button onClick={doReset}>重置演示数据</button>
      </section>

      {showAdd && (
        <section className="panel add-form">
          <div className="field-grid">
            <label>
              <span>气瓶编号</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 TANK-312" />
            </label>
            <label>
              <span>容积</span>
              <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="如 12L" />
            </label>
            <label>
              <span>材质</span>
              <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="铝瓶/钢瓶" />
            </label>
            <label>
              <span>公称工作压力 bar</span>
              <input type="number" value={wp} onChange={(e) => setWp(e.target.value)} />
            </label>
          </div>
          <div className="btn-row">
            <button
              className="primary"
              onClick={() => {
                createCylinder();
                setShowAdd(false);
                setCode("");
                setVolume("");
                setMaterial("");
              }}
            >
              保存建档
            </button>
          </div>
        </section>
      )}

      <section className="workspace workspace-3">
        <CylinderRoster state={state} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="stack">
          <TestStation state={state} selectedId={selectedId} dispatch={dispatch} />
          <HistoryPanel state={state} selectedId={selectedId} />
        </div>
        <FillQueue state={state} selectedId={selectedId} dispatch={dispatch} />
      </section>

      <RejectionPanel state={state} />
    </main>
  );
}

export default App;

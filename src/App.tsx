import "./styles.css";
import { useState } from "react";
import { useStore } from "./store/store";
import CylinderPanel from "./ui/CylinderPanel";
import InspectionPanel from "./ui/InspectionPanel";
import QueuePanel from "./ui/QueuePanel";
import RejectionPanel from "./ui/RejectionPanel";
import HistoryPanel from "./ui/HistoryPanel";

function App() {
  const state = useStore();
  const [selectedId, setSelectedId] = useState<string>(
    state.cylinders[0]?.id ?? ""
  );
  const cylinder =
    state.cylinders.find((c) => c.id === selectedId) ?? state.cylinders[0];

  const queued = state.plans.filter((p) => p.status === "queued").length;
  const openRejections = state.rejections.filter((r) => {
    const cy = state.cylinders.find((c) => c.id === r.cylinderId);
    return !r.resolved && cy?.version === r.version;
  }).length;
  const pendingApproval = state.inspections.filter(
    (i) => i.result === "pass" && !i.superseded && !i.restoredQueue
  ).length;
  const signed = state.plans.filter((p) => p.status === "completed").length;

  const metrics = [
    { label: "待充填", value: queued, tone: "ok" },
    { label: "拒充待复检", value: openRejections, tone: "bad" },
    { label: "待异员审批", value: pendingApproval, tone: "warn" },
    { label: "累计签收", value: signed, tone: "muted" },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62010 · 潜水气瓶充填 · Port 62010</p>
        <h1>水压检验与拒充复核台</h1>
        <span>
          每只气瓶仅一条有效检验单：登记检验日期、水压值、残余变形率与检验员；水压不足、变形率超标或人员缺失一律拒充，排队计划作废留档。
          复检合格且审批人与检验员不同才恢复排队；气瓶信息更正后旧检验与排队资格立即失效，按新记录重算。
        </span>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label} className={m.tone}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      {cylinder ? (
        <>
          <section className="grid-two">
            <CylinderPanel
              cylinders={state.cylinders}
              state={state}
              selectedId={cylinder.id}
              onSelect={setSelectedId}
            />
            <InspectionPanel cylinder={cylinder} state={state} />
          </section>

          <section className="grid-two">
            <QueuePanel
              state={state}
              cylinders={state.cylinders}
              selectedId={cylinder.id}
              onSelect={setSelectedId}
            />
            <RejectionPanel state={state} onSelect={setSelectedId} />
          </section>

          <HistoryPanel state={state} cylinderId={cylinder.id} />
        </>
      ) : (
        <section className="panel">
          <CylinderPanel
            cylinders={[]}
            state={state}
            selectedId=""
            onSelect={setSelectedId}
          />
        </section>
      )}

      <footer className="foot">
        规则（rules）· 存储（store/localStorage）· 界面（ui）三层分离；数据持久化在本地浏览器，刷新后队列、拒充台账与单瓶履历一致。
      </footer>
    </main>
  );
}

export default App;

import { useState } from "react";
import { AppState } from "../rules/types";
import {
  activePlan,
  activeTest,
  eligibility,
} from "../rules/engine";
import { addYears, daysBetween, TEST_VALID_YEARS } from "../rules/constants";
import { StageBadge } from "./StageBadge";
import { cylinderName } from "../storage/storage";

interface Props {
  state: AppState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 气瓶名册：列出每瓶及其当前唯一有效检验单、排队资格（统一重算结果） */
export default function CylinderRoster({ state, selectedId, onSelect }: Props) {
  const [q, setQ] = useState("");
  const list = state.cylinders.filter((c) =>
    cylinderName(c).toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>统一台账</p>
          <h2>气瓶名册（{state.cylinders.length}）</h2>
        </div>
        <input
          className="inline-search"
          placeholder="搜索编号/容积"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="roster">
        {list.map((c) => {
          const elg = eligibility(state, c.id);
          const test = activeTest(state, c.id);
          const plan = activePlan(state, c.id);
          const expiry = test ? addYears(test.testDate, TEST_VALID_YEARS) : undefined;
          const days = expiry ? daysBetween(expiry) : undefined;
          const outdated = test && test.tankRevision !== c.revision;
          return (
            <button
              key={c.id}
              className={`roster-row ${selectedId === c.id ? "selected" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="roster-main">
                <h3>{c.code}</h3>
                <p>
                  {c.volume} · {c.material} · {c.workingPressure}bar
                  {c.revision > 1 && <em className="rev"> 信息v{c.revision}</em>}
                </p>
                <p className="sub">
                  {test ? (
                    <>
                      检验 {test.testDate} · 水压 {test.testPressure}bar · 变形率{" "}
                      {test.residualDeformationRate}% · {test.inspector}
                      {test.approver ? ` / 审批 ${test.approver}` : ""}
                      {outdated && <b className="warn"> · 旧检验已失效</b>}
                    </>
                  ) : (
                    <b className="warn">尚无有效检验单</b>
                  )}
                </p>
                <p className="sub">
                  {expiry && !outdated && (
                    <>
                      有效期至 {expiry}
                      {days !== undefined && days < 0 ? (
                        <b className="danger">（已过期 {-days} 天）</b>
                      ) : days !== undefined && days <= 30 ? (
                        <b className="warn">（剩余 {days} 天）</b>
                      ) : null}
                    </>
                  )}
                  {plan && <span className="plan-tag">充填计划：在队</span>}
                </p>
              </div>
              <StageBadge elg={elg} />
            </button>
          );
        })}
        {list.length === 0 && <p className="empty">没有匹配的气瓶</p>}
      </div>
    </section>
  );
}

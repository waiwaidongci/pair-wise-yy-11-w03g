// 气瓶档案：登记、信息更正（旧检验与排队资格立即失效）、状态总览。
import { useMemo, useState } from "react";
import { Cylinder } from "../rules/types";
import {
  activeInspectionOf,
  eligibilityOf,
  openRejectionOf,
} from "../rules/engine";
import { actions } from "../store/store";
import { eligibilityLabel } from "./format";
import { NoticeBar, useAction } from "./useAction";

export default function CylinderPanel({
  cylinders,
  state,
  selectedId,
  onSelect,
}: {
  cylinders: Cylinder[];
  state: Parameters<typeof eligibilityOf>[0];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { notice, run, setNotice } = useAction();
  const [id, setId] = useState("");
  const [volume, setVolume] = useState("");
  const [wp, setWp] = useState("200");
  const [editId, setEditId] = useState<string | null>(null);
  const [editVolume, setEditVolume] = useState("");
  const [editWp, setEditWp] = useState("");

  const rows = useMemo(
    () =>
      cylinders.map((c) => {
        const elig = eligibilityOf(state, c.id, c.version);
        const insp = activeInspectionOf(state, c.id, c.version);
        const open = openRejectionOf(state, c.id, c.version);
        return { c, elig, insp, open };
      }),
    [cylinders, state]
  );

  const register = () => {
    const r = run(() =>
      actions.registerCylinder({
        id,
        volume,
        workingPressure: Number(wp),
      })
    );
    if (r.ok) {
      setId("");
      setVolume("");
      onSelect(id);
      setNotice({ ok: true, text: `气瓶 ${id} 已登记` });
    }
  };

  const startEdit = (c: Cylinder) => {
    setEditId(c.id);
    setEditVolume(c.volume);
    setEditWp(String(c.workingPressure));
    setNotice(null);
  };

  const submitEdit = () => {
    if (!editId) return;
    const r = run(() =>
      actions.correctCylinder(editId, {
        volume: editVolume,
        workingPressure: Number(editWp),
      })
    );
    if (r.ok) {
      setEditId(null);
      setNotice({ ok: true, text: `${editId} 信息已更正，旧检验与排队资格失效` });
    }
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>气瓶档案</p>
          <h2>登记与信息更正</h2>
        </div>
        <button className="ghost" onClick={() => actions.resetDemo()} title="恢复演示数据">
          重置演示数据
        </button>
      </div>

      <NoticeBar notice={notice} />

      <div className="field-grid">
        <label>
          <span>气瓶编号</span>
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="如 TANK-301" />
        </label>
        <label>
          <span>容积 / 瓶型</span>
          <input value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="如 12L铝瓶" />
        </label>
        <label>
          <span>公称工作压力（bar）</span>
          <input type="number" value={wp} onChange={(e) => setWp(e.target.value)} />
        </label>
        <div className="align-end">
          <button className="primary" onClick={register}>
            登记气瓶
          </button>
        </div>
      </div>

      <p className="hint">
        更正瓶型或工作压力后版本号 +1：旧检验单立即作废、排队中计划同步作废旧档，须按新记录重新水压检验。
      </p>

      <div className="cy-list">
        {rows.map(({ c, elig, insp, open }) => {
          const badge = eligibilityLabel(elig);
          const editing = editId === c.id;
          return (
            <article
              key={c.id}
              className={`cy-row ${selectedId === c.id ? "sel" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <div className="cy-main">
                <h3>
                  {c.id}
                  {c.version > 1 && <em className="ver">v{c.version}</em>}
                </h3>
                {!editing ? (
                  <p>
                    {c.volume} · 工作压力 {c.workingPressure}bar · 试验压力要求 ≥
                    {Math.round(c.workingPressure * 1.5)}bar
                  </p>
                ) : (
                  <div
                    className="inline-edit"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      value={editVolume}
                      onChange={(e) => setEditVolume(e.target.value)}
                      placeholder="容积/瓶型"
                    />
                    <input
                      type="number"
                      value={editWp}
                      onChange={(e) => setEditWp(e.target.value)}
                      placeholder="工作压力"
                    />
                    <button className="primary" onClick={submitEdit}>
                      确认更正
                    </button>
                    <button onClick={() => setEditId(null)}>取消</button>
                  </div>
                )}
                <p className="sub">
                  {insp
                    ? `有效检验单 ${insp.id} · ${insp.date} · ${insp.inspector || "检验员缺失"}`
                    : "当前版本暂无有效检验单"}
                  {open && <b className="dot-bad"> · 有未核销拒充</b>}
                </p>
              </div>
              <div className="cy-side">
                <span className={`badge ${badge.tone}`}>{badge.text}</span>
                {!editing && (
                  <button
                    className="mini"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(c);
                    }}
                  >
                    更正信息
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

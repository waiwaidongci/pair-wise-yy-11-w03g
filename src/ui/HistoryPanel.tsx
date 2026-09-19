// 单瓶履历：按时间呈现登记、检验、拒充、作废、恢复、签收全过程；
// 信息更正后旧版本记录仍保留可追溯。
import { DomainState } from "../rules/types";
import {
  activeInspectionOf,
  historyOf,
  inspectionHistoryOf,
} from "../rules/engine";
import { fmtTime, KIND_LABEL } from "./format";

export default function HistoryPanel({
  state,
  cylinderId,
}: {
  state: DomainState;
  cylinderId: string;
}) {
  const events = historyOf(state, cylinderId);
  const inspections = inspectionHistoryOf(state, cylinderId);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>单瓶履历</p>
          <h2>{cylinderId} 全量记录</h2>
        </div>
      </div>

      <h3>检验单历史（每版本仅一条有效单）</h3>
      <table className="insp-table">
        <thead>
          <tr>
            <th>单号</th>
            <th>版本</th>
            <th>日期</th>
            <th>水压(bar)</th>
            <th>变形率(%)</th>
            <th>检验员</th>
            <th>审批人</th>
            <th>结论 / 状态</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((i) => {
            const isActive = activeInspectionOf(state, cylinderId, i.version)?.id === i.id;
            return (
              <tr key={i.id} className={isActive ? "active-row" : "stale-row"}>
                <td>{i.id}</td>
                <td>v{i.version}</td>
                <td>{i.date}</td>
                <td>{i.testPressure ?? "—"}</td>
                <td>{i.residualDeformation ?? "—"}</td>
                <td>{i.inspector || "（缺失）"}</td>
                <td>{i.approver || "—"}</td>
                <td>
                  {i.result === "reject" ? (
                    <span className="badge bad">拒充：{i.reasons.join("、")}</span>
                  ) : i.restoredQueue ? (
                    <span className="badge ok">合格 · 已恢复</span>
                  ) : (
                    <span className="badge warn">合格 · 待审批</span>
                  )}
                  {!isActive && <span className="tag">已失效（被替代/信息更正）</span>}
                </td>
              </tr>
            );
          })}
          {inspections.length === 0 && (
            <tr>
              <td colSpan={8} className="sub">
                暂无检验记录
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>履历时间线</h3>
      <ol className="timeline">
        {events.map((e) => (
          <li key={e.id} data-kind={e.kind}>
            <time>{fmtTime(e.at)}</time>
            <span className={`ev-kind k-${e.kind}`}>{KIND_LABEL[e.kind] ?? e.kind}</span>
            {e.version > 1 || e.kind === "correct" ? <em className="ver">v{e.version}</em> : null}
            <p>{e.detail}</p>
          </li>
        ))}
        {events.length === 0 && <li className="sub">暂无履历</li>}
      </ol>
    </section>
  );
}

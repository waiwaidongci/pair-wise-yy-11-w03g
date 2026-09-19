import { AppState } from "../rules/types";
import { cylinderHistory } from "../rules/engine";
import { cylinderName } from "../storage/storage";
import { fmtTime } from "./StageBadge";

interface Props {
  state: AppState;
  selectedId: string | null;
}

/** 单瓶履历：检验、拒充、作废留档、审批、排队、签收、信息更正全量事件流 */
export default function HistoryPanel({ state, selectedId }: Props) {
  if (!selectedId) return null;
  const cyl = state.cylinders.find((c) => c.id === selectedId);
  if (!cyl) return null;
  const rows = cylinderHistory(state, selectedId);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>全生命周期</p>
          <h2>{cylinderName(cyl)} · 单瓶履历</h2>
        </div>
      </div>
      <ol className="timeline">
        {rows.map((r) => (
          <li key={r.at + r.kind} className={`tl-${r.kind}`}>
            <time>{fmtTime(r.at)}</time>
            <span className="tl-kind">{r.kind}</span>
            <p>{r.detail}</p>
          </li>
        ))}
        {rows.length === 0 && <p className="empty">暂无履历</p>}
      </ol>
    </section>
  );
}

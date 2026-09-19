// 调用存储层动作并展示成功/失败提示的小组件。
import { useState } from "react";
import { actions } from "../store/store";

type Notice = { ok: boolean; text: string } | null;

export function useAction() {
  const [notice, setNotice] = useState<Notice>(null);
  const run = (fn: () => ReturnType<typeof actions.resetDemo>) => {
    const r = fn();
    setNotice(r.ok ? { ok: true, text: "操作成功" } : { ok: false, text: r.error ?? "操作失败" });
    return r;
  };
  return { notice, run, setNotice };
}

export function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`notice ${notice.ok ? "ok" : "err"}`}>{notice.text}</div>;
}

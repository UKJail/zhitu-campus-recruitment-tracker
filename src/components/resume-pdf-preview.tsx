"use client";

import { useEffect, useRef, useState } from "react";
import { renderResumePdfPreview } from "@/lib/resumes/pdf-preview";

export function ResumePdfPreview({ blob }: { blob: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    const controller = new AbortController();
    const target = canvas.current;
    if (!target) return;
    void renderResumePdfPreview(blob, target, controller.signal).then(() => {
      if (!controller.signal.aborted) setStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("failed");
    });
    return () => { controller.abort(); target.width = 0; target.height = 0; };
  }, [blob]);
  return <div className="resume-pdf-canvas" aria-busy={status === "loading"}>
    {status !== "ready" && <p role="status">{status === "loading" ? "正在显示简历…" : "预览未能打开，请下载 PDF 查看。"}</p>}
    <canvas ref={canvas} title="已生成简历 PDF" role="img" aria-label="已生成简历 PDF 页面" hidden={status !== "ready"} />
  </div>;
}

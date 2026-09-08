import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { draw } = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock("@/lib/resumes/pdf-preview", () => ({ renderResumePdfPreview: draw }));
import { ResumePdfPreview } from "./resume-pdf-preview";

describe("resume PDF page preview", () => {
  beforeEach(() => { draw.mockReset(); });
  afterEach(cleanup);
  const sample = () => new Blob(["%PDF-1.7"], { type: "application/pdf" });

  it("shows the page only after rendering succeeds", async () => {
    draw.mockResolvedValue(undefined);
    const blob = sample();
    render(<ResumePdfPreview blob={blob} />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByRole("img", { name: "已生成简历 PDF 页面" }).hasAttribute("hidden")).toBe(false);
    expect(draw).toHaveBeenCalledWith(blob, expect.any(HTMLCanvasElement), expect.any(AbortSignal));
  });

  it("keeps a failed or partial rendering hidden and offers a download fallback", async () => {
    draw.mockRejectedValue(new Error("unsupported"));
    render(<ResumePdfPreview blob={sample()} />);
    expect(await screen.findByText("预览未能打开，请下载 PDF 查看。")).toBeTruthy();
    expect(screen.getByTitle("已生成简历 PDF").hasAttribute("hidden")).toBe(true);
  });

  it("aborts the renderer and clears pixels when the preview is closed", async () => {
    draw.mockImplementation(() => new Promise(() => undefined));
    const mounted = render(<ResumePdfPreview blob={sample()} />);
    const canvas = screen.getByTitle("已生成简历 PDF") as HTMLCanvasElement;
    await waitFor(() => expect(draw).toHaveBeenCalledTimes(1));
    const signal = draw.mock.calls[0][2] as AbortSignal;
    mounted.unmount();
    expect(signal.aborted).toBe(true);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});

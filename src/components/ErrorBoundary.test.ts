import React from "react";
import { act, create } from "react-test-renderer";
import { expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";
it("collapses technical details and confirms destructive reset", () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const removeItem = vi.fn(), reload = vi.fn();
  vi.stubGlobal("window", { confirm: () => false, localStorage: { removeItem }, location: { reload } });
  function Broken(): never { throw new Error("internal detail"); }
  let root: ReturnType<typeof create>;
  try {
    act(() => { root = create(React.createElement(ErrorBoundary, null, React.createElement(Broken))); });
    expect(root!.root.findByType("details").props.open).toBeUndefined();
    expect(JSON.stringify(root!.toJSON())).toContain("ui-");
    act(() => root!.root.findAllByType("button")[1].props.onClick());
    expect(removeItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    act(() => root!.unmount());
  } finally { spy.mockRestore(); vi.unstubAllGlobals(); }
});

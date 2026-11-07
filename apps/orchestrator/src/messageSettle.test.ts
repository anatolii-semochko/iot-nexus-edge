import { afterEach, describe, expect, it, vi } from "vitest";

import { settle } from "./messageSettle.js";

const entry = (code: string, text = code) => ({ code, level: 1, text });
const codes = (entries: { code: string }[]) => entries.map((e) => e.code);

describe("settle (warnings / errors gone from a report)", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps an entry active for clearAfterMs after it is gone, with its last text", () => {
    vi.useFakeTimers();
    expect(codes(settle(1, "error", [entry("write_ph", "first")], 30_000))).toEqual(["write_ph"]);
    vi.advanceTimersByTime(2_000);
    expect(settle(1, "error", [], 30_000)).toEqual([entry("write_ph", "first")]);
    vi.advanceTimersByTime(29_000);
    expect(settle(1, "error", [], 30_000)).toEqual([]);
  });

  it("a flapping entry stays one active entry", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 10; i++) {
      expect(codes(settle(2, "warning", i % 2 ? [] : [entry("tanks_low")], 30_000))).toEqual(["tanks_low"]);
      vi.advanceTimersByTime(2_000);
    }
  });

  it("0 - no hold; messages are never held", () => {
    vi.useFakeTimers();
    settle(3, "warning", [entry("cpu_warning")], 0);
    expect(settle(3, "warning", [], 0)).toEqual([]);
    settle(3, "message", [entry("notice")], 30_000);
    expect(settle(3, "message", [], 30_000)).toEqual([]);
  });
});

describe("settle after a restart", () => {
  it("holds what the API has active until the process reports again", async () => {
    vi.useFakeTimers();
    const { setTickProcesses } = await import("./tickProcesses.js");
    setTickProcesses([{ id: 9, messages: [{ type: "warning", level: 1, code: "tests_due", text: "Manual tests due" }] }] as never);
    expect(settle(9, "warning", [], 30_000)).toEqual([entry("tests_due", "Manual tests due")]);
    vi.advanceTimersByTime(31_000);
    expect(settle(9, "warning", [], 30_000)).toEqual([]);
    setTickProcesses([]);
  });
});

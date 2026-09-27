import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReportDictation } from "./use-report-dictation";

type ResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() { FakeSpeechRecognition.latest = this; }
}

type SpeechWindow = Window & { SpeechRecognition?: typeof FakeSpeechRecognition };
const browser = window as SpeechWindow;
const originalRecognition = Object.getOwnPropertyDescriptor(window, "SpeechRecognition");

function emitResult(transcript: string, isFinal: boolean) {
  const results = [{ isFinal, 0: { transcript } }];
  act(() => FakeSpeechRecognition.latest.onresult?.({ resultIndex: 0, results }));
}

describe("useReportDictation", () => {
  beforeEach(() => {
    FakeSpeechRecognition.latest = undefined as unknown as FakeSpeechRecognition;
    Object.defineProperty(browser, "SpeechRecognition", { configurable: true, value: FakeSpeechRecognition });
  });

  afterEach(() => {
    if (originalRecognition) Object.defineProperty(browser, "SpeechRecognition", originalRecognition);
    else delete browser.SpeechRecognition;
  });

  it("starts only on request, emits final text, and exposes interim words", async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useReportDictation({ enabled: true, onTranscript }));
    await waitFor(() => expect(result.current.supported).toBe(true));

    act(() => result.current.start());
    const recognition = FakeSpeechRecognition.latest;
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe(navigator.language);
    expect(result.current.listening).toBe(true);

    emitResult("Icy near Van Vleck", false);
    expect(result.current.interimText).toBe("Icy near Van Vleck");
    expect(onTranscript).not.toHaveBeenCalled();
    emitResult("Icy near Van Vleck.", true);
    expect(onTranscript).toHaveBeenCalledWith("Icy near Van Vleck.");

    act(() => result.current.stop());
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    act(() => recognition.onend?.());
    expect(result.current.listening).toBe(false);
    expect(result.current.interimText).toBe("");
  });

  it("reports microphone denial in plain language", async () => {
    const { result } = renderHook(() => useReportDictation({ enabled: true, onTranscript: vi.fn() }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start());
    act(() => FakeSpeechRecognition.latest.onerror?.({ error: "not-allowed" }));

    expect(result.current.listening).toBe(false);
    expect(result.current.error).toMatch(/Microphone access or speech recognition is blocked/);
  });

  it("does not start when disabled and aborts when the caller cancels", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useReportDictation({ enabled, onTranscript: vi.fn() }),
      { initialProps: { enabled: false } },
    );
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start());
    expect(FakeSpeechRecognition.latest).toBeUndefined();

    rerender({ enabled: true });
    act(() => result.current.start());
    const recognition = FakeSpeechRecognition.latest;
    act(() => result.current.cancel());

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
    expect(result.current.listening).toBe(false);
  });

  it("leaves typing available when the browser has no recognition implementation", async () => {
    delete browser.SpeechRecognition;
    const { result } = renderHook(() => useReportDictation({ enabled: true, onTranscript: vi.fn() }));
    await waitFor(() => expect(result.current.supported).toBe(false));

    act(() => result.current.start());

    expect(result.current.error).toContain("isn't available in this browser");
  });

  it("aborts and releases recognition when the composer unmounts", async () => {
    const { result, unmount } = renderHook(() => useReportDictation({ enabled: true, onTranscript: vi.fn() }));
    await waitFor(() => expect(result.current.supported).toBe(true));
    act(() => result.current.start());
    const recognition = FakeSpeechRecognition.latest;

    unmount();

    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(recognition.onend).toBeNull();
  });
});

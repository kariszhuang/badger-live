"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
};
type SpeechRecognitionErrorLike = { error: string };
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => Recognition;
type DictationWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as DictationWindow;
  return browser.SpeechRecognition || browser.webkitSpeechRecognition || null;
}

function subscribeToRecognitionSupport() { return () => undefined; }
function getRecognitionSupportSnapshot() { return Boolean(recognitionConstructor()); }
function getServerRecognitionSupportSnapshot() { return false; }

function recognitionError(error: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access or speech recognition is blocked. You can type instead.";
    case "audio-capture":
      return "No microphone is available. You can type instead.";
    case "no-speech":
      return "No speech was detected. Try again or type your report.";
    case "network":
      return "The browser's speech service is unavailable. Try again or type your report.";
    default:
      return "Voice dictation stopped. You can keep typing.";
  }
}

function releaseRecognition(recognition: Recognition, abort: boolean) {
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  if (abort) {
    try { recognition.abort(); } catch { /* The browser may already have stopped listening. */ }
  }
}

export function useReportDictation({ enabled, onTranscript }: {
  enabled: boolean;
  onTranscript: (transcript: string) => void;
}) {
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  const recognitionRef = useRef<Recognition | null>(null);
  const supported = useSyncExternalStore(subscribeToRecognitionSupport, getRecognitionSupportSnapshot, getServerRecognitionSupportSnapshot);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState("");

  const cancel = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) releaseRecognition(recognition, true);
    setListening(false);
    setInterimText("");
  }, []);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) releaseRecognition(recognition, true);
  }, []);

  const start = useCallback(() => {
    if (!enabled || recognitionRef.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError("Voice dictation isn't available in this browser. You can type or use your keyboard's dictation.");
      return;
    }

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || "";
        if (result?.isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      setInterimText(interimTranscript.trim());
      if (finalTranscript.trim()) onTranscriptRef.current(finalTranscript.trim());
    };
    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      if (event.error !== "aborted") setError(recognitionError(event.error));
      recognitionRef.current = null;
      releaseRecognition(recognition, false);
      setListening(false);
      setInterimText("");
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      setListening(false);
      setInterimText("");
    };
    recognitionRef.current = recognition;
    setError("");
    setInterimText("");
    try {
      recognition.start();
      setListening(true);
    } catch {
      recognitionRef.current = null;
      releaseRecognition(recognition, false);
      setListening(false);
      setError("Voice dictation couldn't start. You can keep typing.");
    }
  }, [enabled]);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try { recognition.stop(); }
    catch {
      recognitionRef.current = null;
      releaseRecognition(recognition, true);
      setListening(false);
      setInterimText("");
    }
  }, []);

  return { supported, listening, interimText, error, start, stop, cancel };
}

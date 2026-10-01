"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic, MicOff, Sparkles, Loader2, ArrowRight, Volume2 } from "lucide-react";

interface VoiceChatBarProps {
  onSend: (query: string, langCode?: string) => void;
  /** Still accepted for compatibility, but Web Speech API is used instead when available */
  onTranscribe: (audioBlob: Blob, langCode?: string) => Promise<string | null>;
  isLoading: boolean;
  /** Base64 audio URI from backend TTS — auto-plays when set */
  audioBase64?: string | null;
}

const LANGUAGES = [
  { code: "en", name: "English",         bcp47: "en-IN" },
  { code: "ta", name: "Tamil (தமிழ்)",   bcp47: "ta-IN" },
  { code: "te", name: "Telugu (తెలుగు)", bcp47: "te-IN" },
  { code: "ml", name: "Malayalam (മലയാളം)", bcp47: "ml-IN" },
  { code: "kn", name: "Kannada (ಕನ್ನಡ)", bcp47: "kn-IN" },
  { code: "hi", name: "Hindi (हिन्दी)",  bcp47: "hi-IN" },
  { code: "mr", name: "Marathi (मराठी)", bcp47: "mr-IN" },
  { code: "gu", name: "Gujarati (ગુજરાતી)", bcp47: "gu-IN" },
  { code: "bn", name: "Bengali (বাংলা)", bcp47: "bn-IN" },
  { code: "or", name: "Odia (ଓଡ଼ିଆ)",   bcp47: "or-IN" },
];

// Detect Web Speech API support
const hasSpeechRecognition =
  typeof window !== "undefined" &&
  !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

type SpeechRecognitionEvent = {
  results: { [index: number]: { [index: number]: { transcript: string } } };
  resultIndex: number;
};

export function VoiceChatBar({ onSend, onTranscribe, isLoading, audioBase64 }: VoiceChatBarProps) {
  const [inputQuery, setInputQuery] = useState("");
  const [selectedLang, setSelectedLang] = useState("en");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useNativeSpeech] = useState(hasSpeechRecognition);

  // Refs for Web Speech API path
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Refs for MediaRecorder fallback path
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Ref for TTS audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-play TTS audio when a new advisory response arrives
  useEffect(() => {
    if (!audioBase64) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(audioBase64);
    audioRef.current = audio;
    setIsPlaying(true);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => setIsPlaying(false);
    audio.play().catch(() => setIsPlaying(false));
    return () => { audio.pause(); };
  }, [audioBase64]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    onSend(inputQuery, selectedLang);
    setInputQuery("");
  };

  // ── Path A: Web Speech API (Chrome/Edge — no backend, no format issues) ──
  const startNativeSpeech = useCallback(() => {
    const lang = LANGUAGES.find((l) => l.code === selectedLang)?.bcp47 ?? "en-IN";
    const SpeechRecognitionCtor = (
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    ) as (new () => SpeechRecognitionInstance) | undefined;

    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[event.resultIndex][0].transcript;
      setInputQuery(transcript);
    };

    recognition.onerror = (e: { error: string }) => {
      console.warn("SpeechRecognition error:", e.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [selectedLang]);

  const stopNativeSpeech = useCallback(() => {
    recognitionRef.current?.stop();
    setIsRecording(false);
  }, []);

  // ── Path B: MediaRecorder → backend /transcribe (Firefox fallback) ──
  const startMediaRecorder = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        setIsTranscribing(true);
        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((t) => t.stop());
        const text = await onTranscribe(audioBlob, selectedLang);
        setIsTranscribing(false);
        if (text) setInputQuery(text);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.warn("Microphone access error:", err);
      alert("Microphone access was denied or unavailable.");
      setIsRecording(false);
    }
  }, [selectedLang, onTranscribe]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const toggleRecording = () => {
    if (isRecording) {
      useNativeSpeech ? stopNativeSpeech() : stopMediaRecorder();
    } else {
      useNativeSpeech ? startNativeSpeech() : startMediaRecorder();
    }
  };

  return (
    <div className="sticky bottom-0 z-40 bg-ocean-900/90 backdrop-blur-md border-t border-ocean-600/70 p-2.5 sm:p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.5)]">
      <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">

        {/* Left: Brand label / TTS playing indicator */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
          {isPlaying ? (
            <>
              <div className="w-6 h-6 rounded-md bg-green-400/10 border border-green-400/30 flex items-center justify-center text-green-400 animate-pulse">
                <Volume2 size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-green-400 text-[11px] uppercase tracking-wider animate-pulse">
                  ORCA Speaking...
                </span>
                <span className="text-[10px] text-slate-400">Advisory audio playback</span>
              </div>
            </>
          ) : (
            <>
              <div className="w-6 h-6 rounded-md bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
                <Sparkles size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-white text-[11px] uppercase tracking-wider">
                  ORCA Marine Dialogue
                </span>
                <span className="text-[10px] text-cyan-400">Multi-Agent LangGraph AI</span>
              </div>
            </>
          )}
        </div>

        {/* Center: Input form */}
        <form onSubmit={handleSend} className="w-full lg:max-w-3xl flex items-center gap-2">
          {/* Language Selector */}
          <div className="relative shrink-0">
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-ocean-800 border border-ocean-600 text-slate-200 text-xs rounded-xl pl-2.5 pr-6 py-2 outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer font-medium"
              aria-label="Advisory language selector"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Text Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder={
                isRecording
                  ? "🎙️ Listening… speak now"
                  : isTranscribing
                  ? "Transcribing…"
                  : "Ask ORCA about sea conditions, wave forecasts, or PFZ hotspots..."
              }
              disabled={isLoading || isTranscribing}
              className="w-full bg-ocean-800 border border-ocean-600 focus:border-cyan-400 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-400 outline-none transition font-sans shadow-inner disabled:opacity-60"
            />
            {(isTranscribing) && (
              <span className="absolute right-3 top-2.5 text-xs font-mono text-cyan-400 flex items-center gap-1">
                <Loader2 size={13} className="animate-spin" />
                <span>Transcribing...</span>
              </span>
            )}
          </div>

          {/* Voice Button */}
          <div className="relative shrink-0">
            {isRecording && (
              <span className="absolute inset-0 rounded-xl bg-red-500 animate-ping opacity-75" />
            )}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing}
              className={`relative p-2.5 rounded-xl border flex items-center justify-center transition active:scale-95 min-w-[44px] min-h-[44px] ${
                isRecording
                  ? "bg-red-500 text-white border-red-400 shadow-[0_0_16px_rgba(248,113,113,0.6)]"
                  : "bg-ocean-800 hover:bg-ocean-700 text-slate-300 hover:text-cyan-400 border-ocean-600"
              }`}
              title={isRecording ? "Stop recording" : "Record voice question"}
              aria-label={isRecording ? "Stop recording audio" : "Record voice question"}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading}
            className="shrink-0 p-2.5 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-ocean-900 font-bold transition flex items-center gap-1.5 shadow-[0_0_14px_rgba(34,211,238,0.3)] disabled:opacity-50 disabled:shadow-none min-h-[44px] active:scale-95"
            title="Submit question to ORCA"
            aria-label="Send query"
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <span className="hidden sm:inline text-xs font-extrabold uppercase tracking-wide">
                  Ask
                </span>
                <ArrowRight size={17} strokeWidth={2.5} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

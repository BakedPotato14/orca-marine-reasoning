"use client";

import React, { useState, useRef } from "react";
import { Send, Mic, MicOff, Trash2, Bot, User, Sparkles } from "lucide-react";
import type { ChatMessage, QueryResponse } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";

interface ChatPanelProps {
  history: ChatMessage[];
  isLoading: boolean;
  onSend: (query: string) => void;
  onTranscribe: (audioBlob: Blob) => Promise<string | null>;
  onClear: () => void;
  onSelectResponse?: (res: QueryResponse) => void;
}

const SAMPLE_QUERIES = [
  "Is it safe to sail today from Mangalore?",
  "Locate active high-probability PFZ hotspots",
  "Check wave conditions & EEZ border for night voyage",
  "What if I delay departure by 3 hours?",
];

export function ChatPanel({
  history,
  isLoading,
  onSend,
  onTranscribe,
  onClear,
  onSelectResponse,
}: ChatPanelProps) {
  const [inputQuery, setInputQuery] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputQuery.trim() || isLoading) return;
    onSend(inputQuery);
    setInputQuery("");
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        stream.getTracks().forEach((track) => track.stop());

        const text = await onTranscribe(audioBlob);
        setIsTranscribing(false);
        if (text) {
          setInputQuery(text);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: unknown) {
      console.warn("Microphone access error:", err);
      alert("Microphone access was denied or unavailable.");
      setIsRecording(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "450px",
        overflow: "hidden",
      }}
    >
      {/* Panel Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          backgroundColor: "rgba(10, 12, 16, 0.7)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bot size={18} color="var(--accent-cyan)" />
          <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
            ORCA AI Marine Advisor
          </span>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="Clear Chat History"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: "0.75rem",
              padding: "4px",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--accent-red)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-muted)")}
          >
            <Trash2 size={14} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Message History Scroll Container */}
      <div
        style={{
          flex: 1,
          padding: "16px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {history.length === 0 ? (
          <div
            style={{
              margin: "auto",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              padding: "20px",
            }}
          >
            <Sparkles size={28} color="var(--accent-cyan)" opacity={0.6} />
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "300px" }}>
              Ask in English, Tamil, Malayalam, Telugu, or Hindi. ORCA synthesizes weather, geofence, and fishing zone data.
            </div>

            {/* Quick suggested prompt pills */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", maxWidth: "340px", marginTop: "6px" }}>
              {SAMPLE_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setInputQuery(q);
                    onSend(q);
                  }}
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    textAlign: "left",
                    color: "var(--text-primary)",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-cyan)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(0, 229, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255, 255, 255, 0.03)";
                  }}
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "4px",
                  fontSize: "0.68rem",
                  color: "var(--text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {msg.role === "user" ? (
                  <>
                    <span>You</span>
                    <User size={12} />
                  </>
                ) : (
                  <>
                    <Bot size={12} color="var(--accent-cyan)" />
                    <span>ORCA Advisory</span>
                    {msg.response && (
                      <VerdictBadge color={msg.response.verdict_color} size="sm" showIcon={false} />
                    )}
                  </>
                )}
              </div>

              <div
                onClick={() => {
                  if (msg.response && onSelectResponse) {
                    onSelectResponse(msg.response);
                  }
                }}
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                  cursor: msg.response ? "pointer" : "default",
                  backgroundColor:
                    msg.role === "user"
                      ? "rgba(0, 229, 255, 0.12)"
                      : "rgba(18, 22, 32, 0.85)",
                  border:
                    msg.role === "user"
                      ? "1px solid rgba(0, 229, 255, 0.3)"
                      : "1px solid var(--border)",
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}

        {/* Loading Bubble */}
        {isLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 0" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                border: "2px solid rgba(0, 229, 255, 0.3)",
                borderTopColor: "var(--accent-cyan)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              ORCA agents synthesizing weather, geofence, & PFZ models...
            </span>
          </div>
        )}
      </div>

      {/* Input Row & Voice Mic Controls */}
      <div
        style={{
          padding: "12px 14px",
          borderTop: "1px solid var(--border)",
          backgroundColor: "rgba(10, 12, 16, 0.9)",
        }}
      >
        <form onSubmit={handleSend} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Voice Input Button */}
          <button
            type="button"
            onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
            disabled={isLoading || isTranscribing}
            title={isRecording ? "Stop recording voice" : "Record voice query"}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: isRecording ? "1px solid var(--accent-red)" : "1px solid var(--border)",
              backgroundColor: isRecording ? "rgba(255, 23, 68, 0.2)" : "rgba(255, 255, 255, 0.04)",
              color: isRecording ? "var(--accent-red)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Text Input */}
          <input
            type="text"
            placeholder={
              isRecording
                ? "🎙️ Listening... click mic again to finish"
                : isTranscribing
                ? "Transcribing voice via Whisper..."
                : "Ask about safety, wave heights, PFZ zones..."
            }
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            disabled={isLoading || isRecording || isTranscribing}
            style={{
              flex: 1,
              height: "38px",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              padding: "0 14px",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              fontFamily: "var(--font-ui)",
              outline: "none",
            }}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent-cyan)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!inputQuery.trim() || isLoading || isRecording}
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "8px",
              border: "none",
              backgroundColor: inputQuery.trim() ? "var(--accent-cyan)" : "rgba(255, 255, 255, 0.05)",
              color: inputQuery.trim() ? "#0a0c10" : "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: inputQuery.trim() ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
            }}
          >
            <Send size={16} />
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

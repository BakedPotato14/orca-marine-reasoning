"use client";

import React from "react";
import { MessageSquare, Bot, User, Trash2, ShieldCheck, AlertTriangle, AlertOctagon, Sparkles } from "lucide-react";
import type { ChatMessage, QueryResponse } from "@/lib/types";

interface DialogueHistoryPanelProps {
  history: ChatMessage[];
  onClear: () => void;
  onSelectResponse?: (res: QueryResponse) => void;
  onSendSampleQuery?: (query: string) => void;
}

const SAMPLE_QUERIES = [
  "Is it safe to sail today from Mangalore?",
  "Locate active high-probability PFZ hotspots",
  "Check wave conditions & EEZ border for night voyage",
  "What if I delay departure by 3 hours?",
];

export function DialogueHistoryPanel({
  history,
  onClear,
  onSelectResponse,
  onSendSampleQuery,
}: DialogueHistoryPanelProps) {
  return (
    <div className="bg-ocean-800/90 border border-ocean-600/70 rounded-xl shadow-lg backdrop-blur-md flex flex-col h-full min-h-[500px] overflow-hidden">
      {/* Header */}
      <div className="p-3.5 px-4 bg-ocean-900/80 border-b border-ocean-700/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={17} className="text-cyan-400" />
          <span className="text-xs font-mono font-bold tracking-wider uppercase text-white">
            Dialogue Turn History ({history.length})
          </span>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-400 transition focus:outline-none"
            title="Clear all conversation turns"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Message List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
        {history.length === 0 ? (
          <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400">
              <Sparkles size={22} />
            </div>
            <h4 className="text-sm font-bold text-white">No Consultations Yet</h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              Use the bottom bar or pick a sample question below to begin marine telemetry analysis.
            </p>

            <div className="w-full max-w-sm mt-3 space-y-1.5">
              {SAMPLE_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSendSampleQuery && onSendSampleQuery(q)}
                  className="w-full text-left p-2.5 rounded-lg bg-ocean-700/40 hover:bg-ocean-700/80 border border-ocean-600/60 hover:border-cyan-400/50 text-xs text-slate-200 transition font-medium"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          history.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                    <Bot size={15} />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed ${
                    isUser
                      ? "bg-cyan-500/20 text-slate-100 border border-cyan-500/30 font-medium"
                      : "bg-ocean-900/90 text-slate-200 border border-ocean-600/80 shadow-md"
                  }`}
                >
                  {/* Verdict Badge if response included */}
                  {msg.response && (
                    <div className="mb-2 flex items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                          msg.response.verdict_color === "red"
                            ? "bg-red-500/20 text-red-400 border border-red-500/40"
                            : msg.response.verdict_color === "amber"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                            : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        }`}
                      >
                        {msg.response.verdict_color} verdict
                      </span>
                    </div>
                  )}

                  <div className="whitespace-pre-line">{msg.content}</div>

                  {msg.response && onSelectResponse && (
                    <button
                      type="button"
                      onClick={() => onSelectResponse(msg.response!)}
                      className="mt-2 text-[10px] font-mono text-cyan-400 hover:underline block"
                    >
                      &rarr; View Full Advisory Card & Map Route
                    </button>
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-lg bg-ocean-700 border border-ocean-600 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <User size={15} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

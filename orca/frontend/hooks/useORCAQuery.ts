"use client";

import { useState, useEffect, useCallback } from "react";
import type { QueryResponse, ChatMessage, TranscribeResponse } from "@/lib/types";
import { getOrCreateThreadId } from "@/lib/utils";

// Default coordinate: Mangalore coastal fishing zone (Karnataka)
export const DEFAULT_COORDS = { lat: 12.87, lon: 74.84 };

export function useORCAQuery() {
  const [threadId, setThreadId] = useState<string>("session_init");
  const [location, setLocation] = useState<{ lat: number; lon: number }>(DEFAULT_COORDS);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState<QueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or restore session threadId on client mount
  useEffect(() => {
    setThreadId(getOrCreateThreadId());
  }, []);

  /**
   * Submit an advisory query to ORCA
   */
  const askQuestion = useCallback(
    async (queryText: string, customLat?: number, customLon?: number) => {
      const activeLat = customLat ?? location.lat;
      const activeLon = customLon ?? location.lon;

      if (!queryText.trim()) return;

      setIsLoading(true);
      setError(null);

      // Create optimistic user message
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: queryText,
        timestamp: new Date(),
      };

      setHistory((prev) => [...prev, userMsg]);

      try {
        const res = await fetch("/api/orca/query", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: queryText,
            lat: activeLat,
            lon: activeLon,
            thread_id: threadId,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || `ORCA query failed (HTTP ${res.status})`);
        }

        const data: QueryResponse = await res.json();
        setCurrentResponse(data);

        // Assistant response message
        const assistantMsg: ChatMessage = {
          id: `orca-${Date.now()}`,
          role: "assistant",
          content: data.final_response,
          timestamp: new Date(),
          response: data,
        };

        setHistory((prev) => [...prev, assistantMsg]);
        return data;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        console.error("ORCA query error:", msg);
      } finally {
        setIsLoading(false);
      }
    },
    [location, threadId]
  );

  /**
   * Transcribe an audio blob (WAV/WEBM) into text via ORCA /transcribe
   */
  const transcribeAudio = useCallback(
    async (audioBlob: Blob, langCode = "en-IN"): Promise<string | null> => {
      try {
        const formData = new FormData();
        // Backend expects 'file' field
        formData.append("file", audioBlob, "voice_input.wav");
        formData.append("lang_code", langCode);

        const res = await fetch("/api/orca/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Voice transcription failed (${res.status})`);
        }

        const data: TranscribeResponse = await res.json();
        return data.transcription || null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("Transcription error:", msg);
        setError(`Transcription failed: ${msg}`);
        return null;
      }
    },
    []
  );

  /**
   * Clear local session chat history
   */
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCurrentResponse(null);
    setError(null);
  }, []);

  return {
    threadId,
    location,
    setLocation,
    history,
    currentResponse,
    isLoading,
    error,
    askQuestion,
    transcribeAudio,
    clearHistory,
  };
}

"use client";

/**
 * VoicePulse — Cœur WebRTC du mode voix ambient (Signature 6).
 *
 * Lifecycle :
 *  1. mint ephemeralKey via /api/realtime/session
 *  2. getUserMedia (mic) + AnalyserNode pour le RMS audioLevel
 *  3. RTCPeerConnection + addTrack + DataChannel "oai-events"
 *  4. SDP offer/answer DIRECT vers api.openai.com avec ephemeralKey
 *  5. ontrack → audio element pour la sortie TTS
 *  6. DataChannel events → store (phase, transcript)
 *
 * Monté UNE SEULE FOIS au root layout via VoiceMount, et activé seulement
 * quand `useVoiceStore.voiceActive` passe à true (déclenché par ⌘7, ⌘⇧V,
 * ou Commandeur). Avant : monté dans VoiceStage → mount/unmount à chaque
 * navigation Stage → 14 sessions OpenAI accumulées. Le bug est résolu en
 * sortant le mount du Stage.
 */

import { useCallback, useEffect, useRef } from "react";
import { useVoiceStore } from "@/stores/voice";

const REALTIME_MODEL = "gpt-4o-realtime-preview";
const REALTIME_SDP_URL = `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
const AUDIO_LEVEL_BOOST = 4;

// Singleton guard module-level — empêche deux PeerConnections OpenAI
// concurrentes même si React Strict Mode ou un re-render parasite remonte
// le composant. Si une session est déjà active, le nouveau start() est no-op.
let activePc: RTCPeerConnection | null = null;

interface RealtimeServerEvent {
  type: string;
  transcript?: string;
  delta?: string;
  item_id?: string;
}

export function VoicePulse() {
  const setPhase = useVoiceStore((s) => s.setPhase);
  const setSessionId = useVoiceStore((s) => s.setSessionId);
  const appendTranscript = useVoiceStore((s) => s.appendTranscript);
  const updateLastTranscript = useVoiceStore((s) => s.updateLastTranscript);
  const setAudioLevel = useVoiceStore((s) => s.setAudioLevel);
  const setError = useVoiceStore((s) => s.setError);
  const reset = useVoiceStore((s) => s.reset);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);

  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    if (activePc === pcRef.current) activePc = null;
    pcRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (audioElRef.current) audioElRef.current.srcObject = null;
    reset();
  }, [reset]);

  const start = useCallback(async () => {
    if (activePc) {
      console.warn("[VoicePulse] Session déjà active, skip nouveau start");
      return;
    }
    setError(null);
    setPhase("connecting");
    try {
      // 1. Mint éphémère via notre serveur
      const sessionRes = await fetch("/api/realtime/session", {
        method: "POST",
        credentials: "include",
      });
      if (!sessionRes.ok) {
        const errBody = (await sessionRes.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(errBody.message || errBody.error || "Échec création session");
      }
      const { sessionId, ephemeralKey } = (await sessionRes.json()) as {
        sessionId: string;
        ephemeralKey: string;
      };
      setSessionId(sessionId);

      // 2. Mic stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Audio level monitoring (RMS via AnalyserNode)
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("AudioContext indisponible");
      const audioCtx = new AudioContextCtor();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setAudioLevel(Math.min(rms * AUDIO_LEVEL_BOOST, 1));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      // 4. RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      activePc = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // 5. ontrack pour piper le TTS dans l'audio element
      const audioEl = audioElRef.current;
      pc.ontrack = (e) => {
        if (audioEl && e.streams[0]) {
          audioEl.srcObject = e.streams[0];
          void audioEl.play().catch(() => {});
        }
      };

      // 6. DataChannel pour les events Realtime
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.addEventListener("message", (ev: MessageEvent<string>) => {
        let msg: RealtimeServerEvent;
        try {
          msg = JSON.parse(ev.data) as RealtimeServerEvent;
        } catch {
          return;
        }
        // https://platform.openai.com/docs/api-reference/realtime-server-events
        switch (msg.type) {
          case "input_audio_buffer.speech_started":
            setPhase("listening");
            break;
          case "input_audio_buffer.speech_stopped":
            setPhase("processing");
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (msg.transcript) {
              appendTranscript({
                id: `u-${Date.now()}`,
                role: "user",
                text: msg.transcript,
                timestamp: Date.now(),
              });
            }
            break;
          case "response.audio_transcript.delta":
            if (msg.delta) {
              if (!currentAssistantIdRef.current) {
                const id = `a-${Date.now()}`;
                currentAssistantIdRef.current = id;
                appendTranscript({
                  id,
                  role: "assistant",
                  text: msg.delta,
                  timestamp: Date.now(),
                });
                setPhase("speaking");
              } else {
                updateLastTranscript(currentAssistantIdRef.current, msg.delta);
              }
            }
            break;
          case "response.done":
            currentAssistantIdRef.current = null;
            setPhase("listening");
            break;
          case "error":
            setError("Erreur OpenAI Realtime");
            setPhase("error");
            break;
          default:
            break;
        }
      });

      // 7. SDP offer/answer direct vers OpenAI
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(REALTIME_SDP_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });
      if (!sdpRes.ok) {
        const body = await sdpRes.text().catch(() => "");
        throw new Error(`SDP exchange failed ${sdpRes.status}: ${body.slice(0, 200)}`);
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setPhase("listening");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setPhase("error");
      teardown();
    }
  }, [
    setPhase,
    setSessionId,
    appendTranscript,
    updateLastTranscript,
    setAudioLevel,
    setError,
    teardown,
  ]);

  useEffect(() => {
    void start();
    return () => teardown();
  }, [start, teardown]);

  return <audio ref={audioElRef} autoPlay aria-hidden />;
}

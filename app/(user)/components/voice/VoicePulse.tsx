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
import { useStageStore, type StagePayload } from "@/stores/stage";

const REALTIME_MODEL = "gpt-4o-realtime-preview";
const REALTIME_SDP_URL = `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
const AUDIO_LEVEL_BOOST = 4;

// Singleton guards module-level — empêchent deux sessions OpenAI Realtime
// concurrentes même si React Strict Mode remonte le composant pendant
// qu'un start() async est en vol. activePc = guard sur PeerConnection
// vivante. isStarting = guard synchrone (set AVANT tout await) qui
// bouche la fenêtre entre l'entrée dans start() et l'assignation d'activePc.
let activePc: RTCPeerConnection | null = null;
let isStarting = false;

interface RealtimeServerEvent {
  type: string;
  transcript?: string;
  delta?: string;
  item_id?: string;
  /** Function calling — arrivent dans `response.function_call_arguments.done`. */
  call_id?: string;
  name?: string;
  arguments?: string;
}

export function VoicePulse() {
  const setPhase = useVoiceStore((s) => s.setPhase);
  const setSessionId = useVoiceStore((s) => s.setSessionId);
  const appendTranscript = useVoiceStore((s) => s.appendTranscript);
  const updateLastTranscript = useVoiceStore((s) => s.updateLastTranscript);
  const patchTranscriptEntry = useVoiceStore((s) => s.patchTranscriptEntry);
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

  /**
   * handleFunctionCall — Exécute un function_call émis par le modèle
   * Realtime, renvoie l'output au DataChannel pour que le modèle continue
   * sa réponse, et applique le stageRequest s'il y en a un.
   *
   * Les tools voix retournent généralement un stageRequest (ex: meeting,
   * simulation, asset image) — on téléporte l'utilisateur immédiatement
   * pour que la voix et le visuel restent synchronisés.
   */
  const handleFunctionCall = useCallback(
    async (callId: string, name: string, argsJson: string) => {
      setPhase("processing");

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(argsJson) as Record<string, unknown>;
      } catch {
        // Args malformés — on continue, le tool retournera un message d'erreur
      }

      // 1. Push tool_call entry pending dans le transcript local (receipt
      //    immédiat dans le ContextRail).
      const callEntryId = `tc-${callId}`;
      appendTranscript({
        id: callEntryId,
        role: "tool_call",
        text: name,
        timestamp: Date.now(),
        callId,
        toolName: name,
        args,
        status: "pending",
      });

      let output = "Erreur d'exécution de l'outil.";
      let stageRequest: StagePayload | undefined;
      let providerId: string | undefined;
      let status: "success" | "error" = "error";

      const sessionId = useVoiceStore.getState().sessionId ?? undefined;

      try {
        const res = await fetch("/api/v2/voice/tool-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name, args, callId, sessionId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          output?: string;
          stageRequest?: StagePayload;
          error?: string;
          providerId?: string;
          status?: "success" | "error";
        };
        if (res.ok) {
          output = data.output ?? output;
          stageRequest = data.stageRequest;
          providerId = data.providerId;
          status = data.status ?? "success";
        } else {
          output = data.output ?? data.error ?? `HTTP ${res.status}`;
          status = "error";
        }
      } catch (err) {
        output = err instanceof Error ? err.message : "Erreur réseau";
        status = "error";
      }

      // 2. Patch tool_call → status final (pending → success/error). Garde
      //    le receipt visible mais résolu.
      patchTranscriptEntry(callEntryId, { status, providerId });

      // 3. Append tool_result entry — ligne distincte qui montre l'output.
      appendTranscript({
        id: `tr-${callId}`,
        role: "tool_result",
        text: output,
        timestamp: Date.now(),
        callId,
        toolName: name,
        output,
        status,
        providerId,
      });

      const dc = dcRef.current;
      if (dc && dc.readyState === "open") {
        dc.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output,
            },
          }),
        );
        dc.send(JSON.stringify({ type: "response.create" }));
      }

      if (stageRequest) {
        // Restaure la phase AVANT le changement de stage : si setMode()
        // déclenche un changement de mode qui démonte VoicePulse (ex: voice
        // → asset après generate_image), le DataChannel event listener
        // disparaît avant que response.done puisse remettre la phase à
        // "listening". Sans ce reset, la phase reste bloquée en "processing"
        // dans le store et l'interface voice est gelée à la prochaine session.
        setPhase("listening");
        useStageStore.getState().setMode(stageRequest);
      }

    },
    [setPhase, appendTranscript, patchTranscriptEntry],
  );

  const start = useCallback(async () => {
    if (isStarting || activePc) {
      console.warn("[VoicePulse] Session déjà active ou en cours, skip");
      return;
    }
    isStarting = true;
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
              const userEntryId = `u-${Date.now()}`;
              appendTranscript({
                id: userEntryId,
                role: "user",
                text: msg.transcript,
                timestamp: Date.now(),
              });
              // Persistance fire-and-forget — le transcript ne casse pas
              // si la migration 0045 n'est pas encore appliquée.
              const sid = useVoiceStore.getState().sessionId;
              if (sid) {
                void fetch("/api/v2/voice/transcripts/append", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    sessionId: sid,
                    entry: {
                      id: userEntryId,
                      role: "user",
                      text: msg.transcript,
                      timestamp: Date.now(),
                    },
                  }),
                }).catch(() => {});
              }
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
          case "response.done": {
            // À la fin de la réponse assistant, on persiste l'entry
            // complète (texte concaténé depuis les deltas).
            const finishedId = currentAssistantIdRef.current;
            if (finishedId) {
              const transcript = useVoiceStore.getState().transcript;
              const finished = transcript.find((e) => e.id === finishedId);
              const sid = useVoiceStore.getState().sessionId;
              if (finished && sid) {
                void fetch("/api/v2/voice/transcripts/append", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ sessionId: sid, entry: finished }),
                }).catch(() => {});
              }
            }
            currentAssistantIdRef.current = null;
            setPhase("listening");
            break;
          }
          case "response.function_call_arguments.done":
            // Le modèle a fini de cracher les arguments d'un tool. On exécute
            // côté serveur, on renvoie l'output via DataChannel, et on applique
            // le stageRequest si présent (ex: téléporter sur MeetingStage).
            if (msg.call_id && msg.name && typeof msg.arguments === "string") {
              void handleFunctionCall(msg.call_id, msg.name, msg.arguments);
            }
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
    } finally {
      isStarting = false;
    }
  }, [
    setPhase,
    setSessionId,
    appendTranscript,
    updateLastTranscript,
    setAudioLevel,
    setError,
    teardown,
    handleFunctionCall,
  ]);

  useEffect(() => {
    void start();
    return () => teardown();
  }, [start, teardown]);

  return <audio ref={audioElRef} autoPlay aria-hidden />;
}

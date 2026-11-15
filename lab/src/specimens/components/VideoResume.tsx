import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, Pause, Play } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import {
  clips,
  formatTime,
  usePlayback,
  VideoScene,
  type Clip,
} from "./VideoScene";
import "./Phone.css";

// params: start(auto | ask | begin), nearend(restart | resume)
// 최근 영상 목록에서 저장한 위치가 있는 영상을 열 때 이어볼지 정하는 방식을 비교한다.
// 둘째 영상은 남은 시간이 전체의 5% 이하라 '거의 다 본 영상' 차원이 적용된다.

const recent = [
  { clip: clips[0], savedMs: 12 * 60_000 + 34_000 },
  { clip: clips[1], savedMs: clips[1].durationMs - 50_000 },
];
// 이어보기 알림과 버튼이 보이는 시간
const NOTICE_MS = 4000;
const NEAR_END_SHARE = 0.05;

type Opened = { clip: Clip; savedMs: number; sequence: number };

export default function VideoResume({ params }: SpecimenProps) {
  const [opened, setOpened] = useState<Opened | null>(null);

  // 열려 있는 영상에서 다른 영상을 바로 열어도 재생 화면을 새로 시작하도록 순번을 올린다
  const open = (index: number) =>
    setOpened((previous) => ({
      ...recent[index],
      sequence: (previous?.sequence ?? 0) + 1,
    }));

  // 시연: 이어볼 영상 열기, (묻는 값이면 재생 화면이) 이어보기 누르기, 거의 다 본 영상 열기, 닫기
  useDemo((tick) => {
    const step = tick % 4;
    if (step === 1) open(0);
    if (step === 3) open(1);
    if (step === 0) setOpened(null);
  });

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <h3>최근 영상</h3>
      </div>
      <ul className="ph-body vrs-list">
        {recent.map(({ clip, savedMs }, index) => (
          <li key={clip.id}>
            <button
              type="button"
              className="vrs-row"
              onClick={() => open(index)}
            >
              <VideoScene
                clip={clip}
                positionMs={savedMs}
                className="vrs-thumb"
              />
              <span className="vrs-text">
                <b>{clip.title}</b>
                <span>
                  {formatTime(savedMs)} / {formatTime(clip.durationMs)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {opened && (
        <Player
          key={opened.sequence}
          opened={opened}
          start={params.start}
          nearEnd={params.nearend}
          onClose={() => setOpened(null)}
        />
      )}
    </div>
  );
}

function Player({
  opened,
  start,
  nearEnd,
  onClose,
}: {
  opened: Opened;
  start: string;
  nearEnd: string;
  onClose: () => void;
}) {
  const { clip, savedMs } = opened;
  const almostDone =
    clip.durationMs - savedMs <= clip.durationMs * NEAR_END_SHARE;
  // 거의 다 봐서 처음부터 트는 경우는 이어보기를 묻거나 알리지 않는다
  const mode = almostDone && nearEnd === "restart" ? "restart" : start;
  const playback = usePlayback(
    clip,
    mode === "auto" || mode === "ask" ? savedMs : 0,
    mode !== "ask",
  );
  const [prompt, setPrompt] = useState(mode === "ask");
  const [notice, setNotice] = useState(mode === "auto" || mode === "begin");
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const fade = { duration: reduced ? 0 : seconds(200), ease: EASE_OUT_CUBIC };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(
      () => setNotice(false),
      seconds(NOTICE_MS) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [notice, seconds]);

  const answer = (resume: boolean) => {
    playback.seek(resume ? savedMs : 0);
    playback.setPlaying(true);
    setPrompt(false);
  };

  // 시연의 둘째 단계에서 묻는 값이면 이어보기를 누른다
  useDemo((tick) => {
    if (tick % 4 === 2 && prompt) answer(true);
  });

  const restart = () => {
    playback.seek(0);
    setNotice(false);
  };
  const resumeFromSaved = () => {
    playback.seek(savedMs);
    setNotice(false);
  };

  return (
    <div className="vrs-player" role="region" aria-label={clip.title}>
      <div className="vrs-player-head">
        <button
          type="button"
          className="ph-icon"
          aria-label="목록으로"
          onClick={onClose}
        >
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <b>{clip.title}</b>
      </div>
      <div className="vd-screen">
        <VideoScene clip={clip} positionMs={playback.positionMs} />
        <AnimatePresence>
          {prompt && (
            <motion.div
              key="prompt"
              className="vrs-prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <p>{formatTime(savedMs)}부터 이어볼까요?</p>
              <div>
                <button
                  type="button"
                  className="vd-chip"
                  onClick={() => answer(false)}
                >
                  처음부터
                </button>
                <button
                  type="button"
                  className="vd-chip is-primary"
                  onClick={() => answer(true)}
                >
                  이어보기
                </button>
              </div>
            </motion.div>
          )}
          {notice && mode === "auto" && (
            <motion.div
              key="auto"
              className="vrs-notice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <span>{formatTime(savedMs)}부터 이어서 재생해요</span>
              <button type="button" className="vd-chip" onClick={restart}>
                처음부터
              </button>
            </motion.div>
          )}
          {notice && mode === "begin" && (
            <motion.div
              key="begin"
              className="vrs-notice is-button-only"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              <button
                type="button"
                className="vd-chip is-primary"
                onClick={resumeFromSaved}
              >
                {formatTime(savedMs)}부터 이어보기
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="vrs-bar" aria-hidden>
        <span
          style={{ width: `${(playback.positionMs / clip.durationMs) * 100}%` }}
        />
      </div>
      <div className="vrs-controls">
        <span className="vd-time">
          {formatTime(playback.positionMs)} / {formatTime(clip.durationMs)}
        </span>
        <button
          type="button"
          className="ph-icon"
          aria-label={playback.playing ? "일시정지" : "재생"}
          disabled={prompt}
          onClick={() => playback.setPlaying(!playback.playing)}
        >
          {playback.playing ? (
            <Pause size={20} strokeWidth={1.75} />
          ) : (
            <Play size={20} strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
}

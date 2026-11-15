import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { EASE_OUT_CUBIC, useDemo, useSeconds } from "../stage";
import type { SpecimenProps } from "../types";
import { clips, formatTime, usePlayback, VideoScene } from "./VideoScene";
import "./Phone.css";

// params: hide(t2 | t4 | tap), layout(center | bottom), time(total | remaining)
// 영상 위에 얹는 재생 조작을 비교한다. 영상을 누르면 조작이 보이거나 숨는다. 일시정지 중에는 숨기지 않는다.

const clip = clips[0];
const SKIP_MS = 10_000;
const hideAfter: Record<string, number | null> = {
  t2: 2000,
  t4: 4000,
  tap: null,
};

export default function VideoControls({ params }: SpecimenProps) {
  const { layout, time } = params;
  const playback = usePlayback(clip, 12 * 60_000 + 34_000);
  const [visible, setVisible] = useState(true);
  // 조작을 만질 때마다 올려 자동 숨김 시간을 처음부터 다시 센다
  const [touched, setTouched] = useState(0);
  const seconds = useSeconds();
  const reduced = useReducedMotion();
  const delay = hideAfter[params.hide] ?? null;

  useEffect(() => {
    if (delay === null || !visible || !playback.playing) return;
    const timer = window.setTimeout(
      () => setVisible(false),
      seconds(delay) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [delay, visible, playback.playing, touched, seconds]);

  const touch = () => {
    setVisible(true);
    setTouched((value) => value + 1);
  };
  const togglePlay = () => {
    playback.setPlaying(!playback.playing);
    touch();
  };
  const skip = (ms: number) => {
    playback.seek(playback.positionMs + ms);
    touch();
  };

  // 시연: 재생, 그대로 두기, 영상 눌러 조작 보이기, 일시정지
  useDemo((tick) => {
    const step = tick % 4;
    if (step === 1) {
      playback.setPlaying(true);
      touch();
    }
    if (step === 3) touch();
    if (step === 0) {
      playback.setPlaying(false);
      touch();
    }
  });

  const share = `${(playback.positionMs / clip.durationMs) * 100}%`;
  const elapsed = formatTime(playback.positionMs);
  const remaining = `-${formatTime(clip.durationMs - playback.positionMs)}`;
  const bar = (
    <span className="vct-bar" aria-hidden>
      <span style={{ width: share }} />
    </span>
  );
  const playButton = (size: number) => (
    <IconButton
      label={playback.playing ? "일시정지" : "재생"}
      onClick={togglePlay}
      size={size}
    >
      {playback.playing ? (
        <Pause size={size * 0.5} fill="currentColor" />
      ) : (
        <Play size={size * 0.5} fill="currentColor" />
      )}
    </IconButton>
  );

  return (
    <div className="ph-frame">
      <div className="ph-head">
        <button type="button" className="ph-icon" aria-label="목록으로">
          <ChevronLeft size={20} strokeWidth={1.75} />
        </button>
        <h3>{clip.title}</h3>
      </div>
      <div className="ph-body">
        <div className="vd-screen">
          <VideoScene clip={clip} positionMs={playback.positionMs} />
          <button
            type="button"
            className="vct-surface"
            aria-label={visible ? "조작 숨기기" : "조작 보이기"}
            onClick={() => (visible ? setVisible(false) : touch())}
          />
          <AnimatePresence>
            {visible && (
              <motion.div
                key="controls"
                className="vct-controls"
                data-layout={layout}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: reduced ? 0 : seconds(200),
                  ease: EASE_OUT_CUBIC,
                }}
              >
                {layout === "center" ? (
                  <>
                    <div className="vct-center">
                      <IconButton
                        label="10초 뒤로"
                        onClick={() => skip(-SKIP_MS)}
                        size={40}
                      >
                        <RotateCcw size={20} strokeWidth={1.75} />
                      </IconButton>
                      {playButton(56)}
                      <IconButton
                        label="10초 앞으로"
                        onClick={() => skip(SKIP_MS)}
                        size={40}
                      >
                        <RotateCw size={20} strokeWidth={1.75} />
                      </IconButton>
                    </div>
                    <div className="vct-bottom">
                      {bar}
                      <div className="vct-times">
                        {time === "total" ? (
                          <span>
                            {elapsed} / {formatTime(clip.durationMs)}
                          </span>
                        ) : (
                          <>
                            <span>{elapsed}</span>
                            <span>{remaining}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="vct-row">
                    {playButton(40)}
                    {time === "remaining" && (
                      <span className="vct-time">{elapsed}</span>
                    )}
                    {bar}
                    <span className="vct-time">
                      {time === "total"
                        ? `${elapsed} / ${formatTime(clip.durationMs)}`
                        : remaining}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="vct-info">
          <b>{clip.title}</b>
          <span>다음 영상</span>
          <p>{clips[1].title}</p>
          <p>{clips[2].title}</p>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  size,
  children,
}: {
  label: string;
  onClick: () => void;
  size: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="vct-icon"
      aria-label={label}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// 숙소 시편들이 사진 대신 쓰는 단순한 방 그림. 장면과 색 조합을 바꿔 사진 여러 장처럼 보이게 한다.
// 실제 사진 파일을 저장소에 두지 않으려고 SVG로 그린다.

export type StayScene = "bedroom" | "lounge" | "bath" | "facade" | "view";

const palettes = {
  oak: {
    wall: "#e9dfd0",
    floor: "#b98d5f",
    accent: "#7a5a3a",
    soft: "#f6efe4",
  },
  linen: {
    wall: "#eeebe4",
    floor: "#cfc6b8",
    accent: "#8a8173",
    soft: "#faf8f3",
  },
  sage: {
    wall: "#dfe6dc",
    floor: "#a9b59f",
    accent: "#5e7058",
    soft: "#f1f4ee",
  },
  clay: {
    wall: "#ecd9cc",
    floor: "#c48f72",
    accent: "#8f5a41",
    soft: "#f7ebe2",
  },
  night: {
    wall: "#2c3240",
    floor: "#4b4f5c",
    accent: "#c9a46a",
    soft: "#3a4152",
  },
  concrete: {
    wall: "#d9dadb",
    floor: "#9fa2a6",
    accent: "#5c6066",
    soft: "#ebeced",
  },
};

export type StayPalette = keyof typeof palettes;

export interface StayPhoto {
  scene: StayScene;
  palette: StayPalette;
}

function Scene({
  scene,
  color,
}: {
  scene: StayScene;
  color: (typeof palettes)[StayPalette];
}) {
  if (scene === "facade") {
    return (
      <>
        <rect width="160" height="120" fill="#c9d8e6" />
        <rect x="0" y="96" width="160" height="24" fill={color.floor} />
        <rect x="30" y="34" width="100" height="64" fill={color.wall} />
        <path d="M24 38 L80 12 L136 38 Z" fill={color.accent} />
        <rect x="70" y="66" width="20" height="32" fill={color.accent} />
        <rect x="40" y="48" width="18" height="16" fill={color.soft} />
        <rect x="102" y="48" width="18" height="16" fill={color.soft} />
      </>
    );
  }
  if (scene === "view") {
    return (
      <>
        <rect width="160" height="120" fill={color.wall} />
        <rect x="18" y="14" width="124" height="70" fill="#b9d0e3" />
        <path
          d="M18 70 L50 48 L78 66 L104 42 L142 64 L142 84 L18 84 Z"
          fill="#7f99ad"
        />
        <rect
          x="18"
          y="14"
          width="124"
          height="70"
          fill="none"
          stroke={color.accent}
          strokeWidth="4"
        />
        <rect x="0" y="92" width="160" height="28" fill={color.floor} />
        <rect x="56" y="88" width="48" height="10" fill={color.accent} />
      </>
    );
  }
  if (scene === "bath") {
    return (
      <>
        <rect width="160" height="120" fill={color.soft} />
        <rect x="0" y="86" width="160" height="34" fill={color.floor} />
        <rect x="22" y="58" width="78" height="34" rx="10" fill="#ffffff" />
        <rect x="22" y="58" width="78" height="8" rx="4" fill={color.wall} />
        <rect x="112" y="22" width="30" height="38" rx="15" fill={color.wall} />
        <rect x="118" y="64" width="18" height="26" fill={color.accent} />
      </>
    );
  }
  if (scene === "lounge") {
    return (
      <>
        <rect width="160" height="120" fill={color.wall} />
        <rect x="0" y="88" width="160" height="32" fill={color.floor} />
        <rect x="22" y="58" width="86" height="30" rx="6" fill={color.accent} />
        <rect
          x="28"
          y="48"
          width="74"
          height="18"
          rx="6"
          fill={color.accent}
          opacity="0.8"
        />
        <rect x="118" y="30" width="22" height="58" fill={color.soft} />
        <circle cx="129" cy="26" r="10" fill={color.soft} />
        <rect x="46" y="16" width="36" height="24" fill={color.soft} />
      </>
    );
  }
  return (
    <>
      <rect width="160" height="120" fill={color.wall} />
      <rect x="0" y="86" width="160" height="34" fill={color.floor} />
      <rect x="96" y="14" width="44" height="40" fill="#cfdde8" />
      <rect
        x="96"
        y="14"
        width="44"
        height="40"
        fill="none"
        stroke={color.soft}
        strokeWidth="3"
      />
      <rect x="18" y="56" width="96" height="34" rx="4" fill={color.soft} />
      <rect x="18" y="44" width="10" height="46" fill={color.accent} />
      <rect x="32" y="50" width="24" height="12" rx="4" fill="#ffffff" />
      <rect x="60" y="50" width="24" height="12" rx="4" fill="#ffffff" />
      <rect
        x="18"
        y="68"
        width="96"
        height="22"
        rx="4"
        fill={color.accent}
        opacity="0.55"
      />
    </>
  );
}

export function StayArt({
  photo,
  label,
}: {
  photo: StayPhoto;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <Scene scene={photo.scene} color={palettes[photo.palette]} />
    </svg>
  );
}

// 숙소 한 곳의 사진 묶음. 시편마다 같은 숙소를 쓰도록 여기서 정한다
export const stayPhotos: StayPhoto[] = [
  { scene: "bedroom", palette: "oak" },
  { scene: "lounge", palette: "oak" },
  { scene: "view", palette: "linen" },
  { scene: "bath", palette: "linen" },
  { scene: "facade", palette: "clay" },
  { scene: "bedroom", palette: "linen" },
  { scene: "lounge", palette: "sage" },
  { scene: "bath", palette: "concrete" },
  { scene: "view", palette: "oak" },
  { scene: "bedroom", palette: "night" },
  { scene: "lounge", palette: "night" },
  { scene: "facade", palette: "linen" },
];

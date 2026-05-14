import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

const { fontFamily: archivo } = loadArchivo();
const { fontFamily: playfair } = loadPlayfair();

const FPS = 30;
const DARK = "#070507";
const INK = "#fff7fb";
const MUTED = "#cdbec6";
const PINK = "#ff4f9a";
const ROSE = "#ffd8e8";
const GOLD = "#ffd07a";

const IMAGES = {
  mall: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1400&q=84",
  bags: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=84",
  makeup: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1400&q=84",
  beauty: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1400&q=84",
};

function ease(frame, fps, delay = 0, duration = 24) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 22, stiffness: 86 },
    durationInFrames: duration,
  });
}

function BrandMark() {
  return (
    <div
      style={{
        position: "absolute",
        top: 58,
        left: 58,
        display: "flex",
        alignItems: "center",
        gap: 18,
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 68,
          height: 68,
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(145deg, ${ROSE}, ${PINK})`,
          color: DARK,
          fontFamily: playfair,
          fontSize: 38,
          fontWeight: 800,
          boxShadow: "0 18px 52px rgba(255,79,154,0.35)",
        }}
      >
        G
      </div>
      <div>
        <div style={{ color: INK, fontFamily: playfair, fontSize: 34, fontWeight: 700 }}>
          Global Bestie
        </div>
        <div style={{ color: MUTED, fontFamily: archivo, fontSize: 18, fontWeight: 700 }}>
          USA shopping, delivered
        </div>
      </div>
    </div>
  );
}

function Background() {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 16%, rgba(255,79,154,0.2), transparent 30%), radial-gradient(circle at 80% 82%, rgba(255,208,122,0.16), transparent 34%), linear-gradient(180deg, #150813 0%, #070507 58%, #10070d 100%)",
      }}
    />
  );
}

function Pill({ children, style }) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: "13px 18px",
        border: "1px solid rgba(255,216,232,0.24)",
        background: "rgba(7,5,7,0.74)",
        color: ROSE,
        fontFamily: archivo,
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FullBleedImage({ src, opacity = 0.7, scale = 1.06, frame }) {
  return (
    <AbsoluteFill>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity,
          transform: `scale(${interpolate(frame, [0, 150], [scale, scale - 0.04], {
            extrapolateRight: "clamp",
          })})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(7,5,7,0.28) 0%, rgba(7,5,7,0.74) 55%, rgba(7,5,7,0.96) 100%)",
        }}
      />
    </AbsoluteFill>
  );
}

function SceneHook({ frame }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 6);
  const sub = ease(frame, fps, 22);

  return (
    <AbsoluteFill>
      <Background />
      <FullBleedImage src={IMAGES.makeup} frame={frame} opacity={0.45} />
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 185,
        }}
      >
        <Pill style={{ opacity: p }}>USA beauty and bags</Pill>
        <h1
          style={{
            margin: "30px 0 26px",
            maxWidth: 800,
            color: INK,
            fontFamily: playfair,
            fontSize: 94,
            lineHeight: 0.96,
            fontWeight: 700,
            opacity: p,
            transform: `translateY(${interpolate(p, [0, 1], [42, 0])}px)`,
          }}
        >
          DM us what you need.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 760,
            color: MUTED,
            fontFamily: archivo,
            fontSize: 32,
            lineHeight: 1.42,
            fontWeight: 700,
            opacity: sub,
          }}
        >
          From premium makeup to Coach and Tory Burch finds, we help make USA shopping convenient.
        </p>
      </div>
    </AbsoluteFill>
  );
}

function SceneMallRun({ frame }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 0);
  const brands = ["Coach", "Tory Burch", "Sephora", "Premium makeup"];

  return (
    <AbsoluteFill>
      <Background />
      <FullBleedImage src={IMAGES.mall} frame={frame} opacity={0.42} />
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          top: 220,
        }}
      >
        <Pill style={{ opacity: title }}>We shop for you</Pill>
        <h2
          style={{
            margin: "30px 0 46px",
            color: INK,
            fontFamily: playfair,
            fontSize: 82,
            lineHeight: 0.98,
            fontWeight: 700,
            opacity: title,
          }}
        >
          USA mall run, minus the stress.
        </h2>
        <div style={{ display: "grid", gap: 18 }}>
          {brands.map((brand, index) => {
            const item = ease(frame, fps, 14 + index * 8);
            return (
              <div
                key={brand}
                style={{
                  padding: "26px 30px",
                  border: "1px solid rgba(255,216,232,0.22)",
                  background: index === 2 ? "rgba(255,79,154,0.13)" : "rgba(255,255,255,0.06)",
                  color: index === 2 ? ROSE : INK,
                  fontFamily: archivo,
                  fontSize: 34,
                  fontWeight: 900,
                  opacity: item,
                  transform: `translateX(${interpolate(item, [0, 1], [-48, 0])}px)`,
                }}
              >
                {brand}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneBeauty({ frame }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 0);
  const cards = [
    ["Lip oils", "Gloss, glow, everyday favorites"],
    ["Blushes", "Trending shades and soft glam"],
    ["Palettes", "Premium makeup picks"],
  ];

  return (
    <AbsoluteFill>
      <Background />
      <div
        style={{
          position: "absolute",
          inset: "185px 58px auto 58px",
          height: 760,
          overflow: "hidden",
          border: "1px solid rgba(255,216,232,0.24)",
          boxShadow: "0 34px 90px rgba(0,0,0,0.42)",
        }}
      >
        <Img
          src={IMAGES.beauty}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${interpolate(frame, [0, 140], [1.06, 1.01])})`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(7,5,7,0.05) 20%, rgba(7,5,7,0.78) 100%)",
          }}
        />
      </div>
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 150,
          opacity: p,
          transform: `translateY(${interpolate(p, [0, 1], [44, 0])}px)`,
        }}
      >
        <Pill>Premium beauty finds</Pill>
        <h2
          style={{
            margin: "28px 0 28px",
            color: INK,
            fontFamily: playfair,
            fontSize: 76,
            lineHeight: 0.98,
            fontWeight: 700,
          }}
        >
          Sephora-style wishlist? We get it.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {cards.map(([title, copy], index) => {
            const card = ease(frame, fps, 16 + index * 8);
            return (
              <div
                key={title}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 20,
                  padding: "18px 22px",
                  border: "1px solid rgba(255,216,232,0.18)",
                  background: "rgba(7,5,7,0.72)",
                  opacity: card,
                }}
              >
                <strong style={{ color: ROSE, fontFamily: archivo, fontSize: 25, fontWeight: 900 }}>
                  {title}
                </strong>
                <span style={{ color: MUTED, fontFamily: archivo, fontSize: 22, fontWeight: 700 }}>
                  {copy}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ParcelIcon({ progress }) {
  return (
    <div
      style={{
        width: 280,
        height: 220,
        position: "relative",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [48, 0])}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 0,
          height: 154,
          background: "linear-gradient(145deg, #ffd8e8, #ff9cc7)",
          border: "2px solid rgba(255,255,255,0.7)",
          boxShadow: "0 28px 80px rgba(255,79,154,0.34)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 54,
          right: 54,
          top: 26,
          height: 86,
          background: "linear-gradient(145deg, #ff4f9a, #ffd8e8)",
          transform: "skewX(-14deg)",
          border: "2px solid rgba(255,255,255,0.65)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          bottom: 0,
          top: 36,
          background: "rgba(7,5,7,0.14)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 82,
          right: 82,
          bottom: 56,
          padding: "8px 10px",
          background: DARK,
          color: ROSE,
          fontFamily: archivo,
          fontSize: 20,
          fontWeight: 900,
          textAlign: "center",
          letterSpacing: "0.08em",
        }}
      >
        GB
      </div>
    </div>
  );
}

function SceneDoorstep({ frame, instagramHandle }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 0);
  const box = ease(frame, fps, 14);
  const cta = ease(frame, fps, 34);
  const pulse = interpolate(Math.sin(frame / 7), [-1, 1], [0.97, 1.03]);

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(150deg, #210b19 0%, #070507 52%, #140810 100%)",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 70px",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 34%, rgba(255,79,154,0.22), transparent 38%)",
        }}
      />
      <ParcelIcon progress={box} />
      <h2
        style={{
          margin: "58px 0 22px",
          color: INK,
          fontFamily: playfair,
          fontSize: 88,
          lineHeight: 0.98,
          textAlign: "center",
          fontWeight: 700,
          opacity: p,
        }}
      >
        Delivered to your doorstep.
      </h2>
      <p
        style={{
          margin: "0 0 52px",
          color: MUTED,
          fontFamily: archivo,
          fontSize: 31,
          lineHeight: 1.45,
          textAlign: "center",
          fontWeight: 700,
          opacity: p,
        }}
      >
        You tell us what you need. We help bring the USA shopping experience to you.
      </p>
      <div
        style={{
          padding: "28px 58px",
          background: `linear-gradient(135deg, ${PINK}, ${ROSE})`,
          boxShadow: "0 26px 80px rgba(255,79,154,0.38)",
          opacity: cta,
          transform: `scale(${pulse})`,
        }}
      >
        <span
          style={{
            color: DARK,
            fontFamily: archivo,
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: "0.02em",
          }}
        >
          DM {instagramHandle}
        </span>
      </div>
    </AbsoluteFill>
  );
}

export const DoorstepReel = ({ instagramHandle = "@globalbestie" }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: DARK }}>
      {frame < 5 * FPS && <SceneHook frame={frame} />}
      {frame >= 5 * FPS && frame < 10 * FPS && <SceneMallRun frame={frame - 5 * FPS} />}
      {frame >= 10 * FPS && frame < 15 * FPS && <SceneBeauty frame={frame - 10 * FPS} />}
      {frame >= 15 * FPS && <SceneDoorstep frame={frame - 15 * FPS} instagramHandle={instagramHandle} />}
    </AbsoluteFill>
  );
};

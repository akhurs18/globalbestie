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

const IMAGES = [
  "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=84",
  "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&q=84",
  "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=84",
  "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=1200&q=84",
];

function ease(frame, fps, delay = 0, duration = 22) {
  return spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 22, stiffness: 90 },
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
          boxShadow: "0 18px 50px rgba(255,79,154,0.32)",
        }}
      >
        G
      </div>
      <div>
        <div style={{ color: INK, fontFamily: playfair, fontSize: 34, fontWeight: 700 }}>
          Global Bestie
        </div>
        <div style={{ color: MUTED, fontFamily: archivo, fontSize: 18, fontWeight: 700 }}>
          USA makeup finds, Pakistan delivery
        </div>
      </div>
    </div>
  );
}

function BackgroundGlow() {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 22% 18%, rgba(255,79,154,0.22), transparent 30%), radial-gradient(circle at 78% 76%, rgba(255,208,122,0.14), transparent 30%), linear-gradient(180deg, #130812 0%, #070507 64%, #110810 100%)",
      }}
    />
  );
}

function CaptionPill({ children, style }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "13px 18px",
        border: "1px solid rgba(255,216,232,0.22)",
        background: "rgba(7,5,7,0.72)",
        color: ROSE,
        fontFamily: archivo,
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function LuxuryCollage({ frame }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 0, 26);
  const drift = interpolate(frame, [0, 120], [0, -28], { extrapolateRight: "clamp" });
  const cards = [
    { src: IMAGES[0], x: 112, y: 330, w: 520, h: 690, r: -4, delay: 0 },
    { src: IMAGES[1], x: 560, y: 240, w: 370, h: 430, r: 5, delay: 8 },
    { src: IMAGES[2], x: 500, y: 780, w: 420, h: 500, r: -2, delay: 15 },
  ];

  return (
    <AbsoluteFill>
      {cards.map((card, index) => {
        const cardProgress = ease(frame, fps, card.delay, 24);
        return (
          <div
            key={card.src}
            style={{
              position: "absolute",
              left: card.x,
              top: card.y + drift * (index + 1) * 0.22,
              width: card.w,
              height: card.h,
              overflow: "hidden",
              border: "1px solid rgba(255,216,232,0.24)",
              boxShadow: "0 34px 90px rgba(0,0,0,0.48)",
              opacity: cardProgress,
              transform: `translateY(${interpolate(cardProgress, [0, 1], [50, 0])}px) rotate(${card.r}deg)`,
            }}
          >
            <Img
              src={card.src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `scale(${1.05 + index * 0.02})`,
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, transparent 38%, rgba(7,5,7,0.58) 100%)",
              }}
            />
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(7,5,7,0.96) 0%, rgba(7,5,7,0.42) 48%, rgba(7,5,7,0.1) 100%)",
          opacity: interpolate(p, [0, 1], [0.4, 1]),
        }}
      />
    </AbsoluteFill>
  );
}

function SceneIntro({ frame }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 6);
  const sub = ease(frame, fps, 18);

  return (
    <AbsoluteFill>
      <BackgroundGlow />
      <LuxuryCollage frame={frame} />
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 180,
          zIndex: 5,
        }}
      >
        <CaptionPill style={{ opacity: title }}>USA makeup sourcing</CaptionPill>
        <h1
          style={{
            margin: "30px 0 26px",
            maxWidth: 740,
            color: INK,
            fontFamily: playfair,
            fontSize: 92,
            lineHeight: 0.96,
            fontWeight: 700,
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [42, 0])}px)`,
          }}
        >
          Your USA makeup wishlist, handled.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: 720,
            color: MUTED,
            fontFamily: archivo,
            fontSize: 32,
            lineHeight: 1.42,
            fontWeight: 700,
            opacity: sub,
          }}
        >
          Send the beauty find you want. We help source makeup, fragrance, and glam gifts from the USA.
        </p>
      </div>
    </AbsoluteFill>
  );
}

function SceneHowItWorks({ frame }) {
  const { fps } = useVideoConfig();
  const headline = ease(frame, fps, 0);
  const steps = [
    ["01", "Send your wishlist", "Drop the product link, screenshot, shade, or brand name in our Instagram DM."],
    ["02", "We source the options", "We help you find USA beauty products and choose the right shade or variant."],
    ["03", "You get it here", "From viral makeup to hard-to-find beauty drops, we make USA shopping easier."],
  ];

  return (
    <AbsoluteFill>
      <BackgroundGlow />
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          top: 210,
        }}
      >
        <CaptionPill style={{ opacity: headline }}>Convenience first</CaptionPill>
        <h2
          style={{
            margin: "28px 0 54px",
            color: INK,
            fontFamily: playfair,
            fontSize: 78,
            lineHeight: 1,
            fontWeight: 700,
            opacity: headline,
          }}
        >
          Beauty sourcing made convenient.
        </h2>
        <div style={{ display: "grid", gap: 22 }}>
          {steps.map(([num, title, copy], index) => {
            const p = ease(frame, fps, 14 + index * 12);
            return (
              <div
                key={title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "94px 1fr",
                  gap: 26,
                  padding: "26px 28px",
                  border: "1px solid rgba(255,216,232,0.2)",
                  background: index === 1 ? "rgba(255,79,154,0.12)" : "rgba(255,255,255,0.05)",
                  opacity: p,
                  transform: `translateX(${interpolate(p, [0, 1], [-48, 0])}px)`,
                }}
              >
                <div
                  style={{
                    width: 70,
                    height: 70,
                    display: "grid",
                    placeItems: "center",
                    border: "1px solid rgba(255,79,154,0.48)",
                    color: PINK,
                    fontFamily: archivo,
                    fontSize: 26,
                    fontWeight: 900,
                  }}
                >
                  {num}
                </div>
                <div>
                  <h3
                    style={{
                      margin: "0 0 8px",
                      color: INK,
                      fontFamily: archivo,
                      fontSize: 34,
                      fontWeight: 900,
                    }}
                  >
                    {title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: MUTED,
                      fontFamily: archivo,
                      fontSize: 25,
                      lineHeight: 1.38,
                      fontWeight: 700,
                    }}
                  >
                    {copy}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneTrust({ frame }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 0);
  const chips = [
    "USA makeup finds",
    "Shade and variant help",
    "Hard-to-find beauty drops",
    "Friendly bestie sourcing",
  ];

  return (
    <AbsoluteFill>
      <BackgroundGlow />
      <Img
        src={IMAGES[3]}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.28,
          transform: `scale(${interpolate(frame, [0, 120], [1.08, 1.02])})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(7,5,7,0.62), rgba(7,5,7,0.96))",
        }}
      />
      <BrandMark />
      <div
        style={{
          position: "absolute",
          left: 58,
          right: 58,
          bottom: 210,
          opacity: p,
          transform: `translateY(${interpolate(p, [0, 1], [44, 0])}px)`,
        }}
      >
        <CaptionPill>What we offer</CaptionPill>
        <h2
          style={{
            margin: "32px 0 42px",
            color: INK,
            fontFamily: playfair,
            fontSize: 86,
            lineHeight: 0.98,
            fontWeight: 700,
          }}
        >
          Your beauty wishlist, without the search spiral.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {chips.map((chip, index) => {
            const chipProgress = ease(frame, fps, 12 + index * 7);
            return (
              <div
                key={chip}
                style={{
                  padding: "22px 20px",
                  border: "1px solid rgba(255,216,232,0.22)",
                  background: "rgba(255,255,255,0.055)",
                  color: index === 0 ? GOLD : INK,
                  fontFamily: archivo,
                  fontSize: 24,
                  fontWeight: 900,
                  lineHeight: 1.16,
                  opacity: chipProgress,
                }}
              >
                {chip}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneCta({ frame, instagramHandle }) {
  const { fps } = useVideoConfig();
  const p = ease(frame, fps, 0);
  const pulse = interpolate(Math.sin(frame / 7), [-1, 1], [0.96, 1.03]);

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
            "radial-gradient(circle at 50% 42%, rgba(255,79,154,0.22), transparent 42%)",
        }}
      />
      <div
        style={{
          width: 128,
          height: 128,
          display: "grid",
          placeItems: "center",
          background: `linear-gradient(145deg, ${ROSE}, ${PINK})`,
          color: DARK,
          fontFamily: playfair,
          fontSize: 68,
          fontWeight: 800,
          boxShadow: "0 26px 80px rgba(255,79,154,0.4)",
          opacity: p,
          transform: `scale(${pulse})`,
        }}
      >
        G
      </div>
      <h2
        style={{
          margin: "54px 0 22px",
          color: INK,
          fontFamily: playfair,
          fontSize: 88,
          lineHeight: 0.98,
          textAlign: "center",
          fontWeight: 700,
          opacity: p,
        }}
      >
        Want USA makeup?
      </h2>
      <p
        style={{
          margin: "0 0 54px",
          color: MUTED,
          fontFamily: archivo,
          fontSize: 31,
          lineHeight: 1.45,
          textAlign: "center",
          fontWeight: 700,
          opacity: p,
        }}
      >
        DM us the product link, screenshot, shade, or brand name.
      </p>
      <div
        style={{
          padding: "28px 58px",
          background: `linear-gradient(135deg, ${PINK}, ${ROSE})`,
          boxShadow: "0 26px 80px rgba(255,79,154,0.38)",
          opacity: p,
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

export const ServiceReel = ({ instagramHandle = "@globalbestie" }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: DARK }}>
      {frame < 5 * FPS && <SceneIntro frame={frame} />}
      {frame >= 5 * FPS && frame < 11 * FPS && <SceneHowItWorks frame={frame - 5 * FPS} />}
      {frame >= 11 * FPS && frame < 16 * FPS && <SceneTrust frame={frame - 11 * FPS} />}
      {frame >= 16 * FPS && <SceneCta frame={frame - 16 * FPS} instagramHandle={instagramHandle} />}
    </AbsoluteFill>
  );
};

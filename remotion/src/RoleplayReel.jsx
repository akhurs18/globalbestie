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
  vanity: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1400&q=84",
  mall: "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1400&q=84",
  makeup: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1400&q=84",
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
        zIndex: 12,
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

function Background({ image, frame, opacity = 0.34 }) {
  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 20% 14%, rgba(255,79,154,0.22), transparent 30%), radial-gradient(circle at 78% 84%, rgba(255,208,122,0.16), transparent 32%), linear-gradient(180deg, #160913 0%, #070507 62%, #10070d 100%)",
      }}
    >
      {image ? (
        <>
          <Img
            src={image}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity,
              transform: `scale(${interpolate(frame, [0, 150], [1.08, 1.02], {
                extrapolateRight: "clamp",
              })})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(7,5,7,0.25), rgba(7,5,7,0.88) 68%, rgba(7,5,7,0.98))",
            }}
          />
        </>
      ) : null}
    </AbsoluteFill>
  );
}

function Pill({ children, style }) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: "13px 18px",
        border: "1px solid rgba(255,216,232,0.24)",
        background: "rgba(7,5,7,0.76)",
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

function Character({ variant = "customer", x, y, scale = 1, progress = 1 }) {
  const skin = variant === "bestie" ? "#f0b99b" : "#d99a7a";
  const hair = variant === "bestie" ? "#231016" : "#2b1513";
  const outfit = variant === "bestie" ? PINK : "#2a1823";
  const bag = variant === "bestie";

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 250,
        height: 430,
        transform: `scale(${scale}) translateY(${interpolate(progress, [0, 1], [44, 0])}px)`,
        opacity: progress,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 58,
          top: 22,
          width: 132,
          height: 152,
          borderRadius: "48% 48% 42% 42%",
          background: hair,
          boxShadow: "0 16px 40px rgba(0,0,0,0.34)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 74,
          top: 48,
          width: 100,
          height: 112,
          borderRadius: "50%",
          background: skin,
          border: "2px solid rgba(255,255,255,0.34)",
        }}
      >
        <div style={{ position: "absolute", left: 27, top: 44, width: 8, height: 8, borderRadius: 99, background: DARK }} />
        <div style={{ position: "absolute", right: 27, top: 44, width: 8, height: 8, borderRadius: 99, background: DARK }} />
        <div style={{ position: "absolute", left: 36, top: 72, width: 30, height: 10, borderBottom: `3px solid ${DARK}`, borderRadius: "0 0 99px 99px" }} />
      </div>
      <div
        style={{
          position: "absolute",
          left: 54,
          top: 166,
          width: 140,
          height: 170,
          borderRadius: "48px 48px 22px 22px",
          background: `linear-gradient(160deg, ${outfit}, ${variant === "bestie" ? ROSE : "#4a2638"})`,
          border: "2px solid rgba(255,255,255,0.16)",
        }}
      />
      <div style={{ position: "absolute", left: 28, top: 190, width: 72, height: 22, borderRadius: 20, background: skin, transform: "rotate(26deg)" }} />
      <div style={{ position: "absolute", right: 28, top: 190, width: 72, height: 22, borderRadius: 20, background: skin, transform: "rotate(-26deg)" }} />
      <div style={{ position: "absolute", left: 74, top: 326, width: 34, height: 84, borderRadius: 18, background: "#20151b" }} />
      <div style={{ position: "absolute", right: 74, top: 326, width: 34, height: 84, borderRadius: 18, background: "#20151b" }} />
      {bag ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 250,
            width: 94,
            height: 96,
            border: "3px solid rgba(255,216,232,0.78)",
            background: "linear-gradient(145deg, #ff4f9a, #ffd8e8)",
            boxShadow: "0 18px 44px rgba(255,79,154,0.34)",
          }}
        >
          <div style={{ position: "absolute", left: 25, top: -24, width: 42, height: 34, border: "5px solid rgba(255,216,232,0.8)", borderBottom: 0, borderRadius: "30px 30px 0 0" }} />
        </div>
      ) : (
        <div
          style={{
            position: "absolute",
            right: 8,
            top: 228,
            width: 58,
            height: 94,
            borderRadius: 12,
            background: DARK,
            border: "3px solid rgba(255,216,232,0.48)",
          }}
        >
          <div style={{ position: "absolute", left: 8, right: 8, top: 12, height: 8, borderRadius: 20, background: PINK }} />
          <div style={{ position: "absolute", left: 8, right: 8, top: 30, height: 30, borderRadius: 8, background: "rgba(255,216,232,0.16)" }} />
        </div>
      )}
    </div>
  );
}

function SpeechBubble({ children, side = "left", x, y, progress = 1, accent = false }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        maxWidth: 570,
        padding: "24px 28px",
        border: `1px solid ${accent ? "rgba(255,79,154,0.44)" : "rgba(255,216,232,0.22)"}`,
        background: accent ? "rgba(255,79,154,0.14)" : "rgba(7,5,7,0.78)",
        color: INK,
        fontFamily: archivo,
        fontSize: 33,
        lineHeight: 1.18,
        fontWeight: 900,
        boxShadow: "0 26px 70px rgba(0,0,0,0.36)",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)`,
      }}
    >
      {children}
      <div
        style={{
          position: "absolute",
          [side === "left" ? "left" : "right"]: 34,
          bottom: -18,
          width: 30,
          height: 30,
          background: accent ? "rgba(255,79,154,0.14)" : "rgba(7,5,7,0.78)",
          borderRight: "1px solid rgba(255,216,232,0.18)",
          borderBottom: "1px solid rgba(255,216,232,0.18)",
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}

function SceneDm({ frame }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 0);
  const customer = ease(frame, fps, 8);
  const bubble1 = ease(frame, fps, 20);
  const bestie = ease(frame, fps, 48);
  const bubble2 = ease(frame, fps, 62);

  return (
    <AbsoluteFill>
      <Background image={IMAGES.vanity} frame={frame} opacity={0.32} />
      <BrandMark />
      <div style={{ position: "absolute", left: 58, right: 58, top: 178 }}>
        <Pill style={{ opacity: title }}>Roleplay</Pill>
        <h1
          style={{
            margin: "26px 0 0",
            color: INK,
            fontFamily: playfair,
            fontSize: 78,
            lineHeight: 0.98,
            fontWeight: 700,
            opacity: title,
          }}
        >
          Customer needs a USA beauty find.
        </h1>
      </div>
      <Character variant="customer" x={70} y={870} scale={1.1} progress={customer} />
      <SpeechBubble x={310} y={735} progress={bubble1}>
        “I need a USA makeup item and a Coach bag.”
      </SpeechBubble>
      <Character variant="bestie" x={730} y={900} scale={1.02} progress={bestie} />
      <SpeechBubble x={120} y={1210} side="right" progress={bubble2} accent>
        “Done bestie. We’ll help shop it for you.”
      </SpeechBubble>
    </AbsoluteFill>
  );
}

function StoreSign({ children, x, y, progress, active = false }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 330,
        padding: "26px 18px",
        textAlign: "center",
        color: active ? DARK : INK,
        background: active ? `linear-gradient(135deg, ${PINK}, ${ROSE})` : "rgba(7,5,7,0.82)",
        border: "1px solid rgba(255,216,232,0.3)",
        fontFamily: playfair,
        fontSize: 42,
        fontWeight: 800,
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [44, 0])}px)`,
        boxShadow: "0 26px 70px rgba(0,0,0,0.36)",
      }}
    >
      {children}
    </div>
  );
}

function SceneMall({ frame }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 0);
  const walk = interpolate(frame, [0, 145], [-90, 250], { extrapolateRight: "clamp" });
  const signs = [ease(frame, fps, 14), ease(frame, fps, 24), ease(frame, fps, 34)];

  return (
    <AbsoluteFill>
      <Background image={IMAGES.mall} frame={frame} opacity={0.42} />
      <BrandMark />
      <div style={{ position: "absolute", left: 58, right: 58, top: 188, opacity: title }}>
        <Pill>USA mall run</Pill>
        <h2
          style={{
            margin: "28px 0 0",
            color: INK,
            fontFamily: playfair,
            fontSize: 82,
            lineHeight: 0.96,
            fontWeight: 700,
          }}
        >
          We check the brands for you.
        </h2>
      </div>
      <StoreSign x={80} y={520} progress={signs[0]}>Coach</StoreSign>
      <StoreSign x={375} y={690} progress={signs[1]}>Tory Burch</StoreSign>
      <StoreSign x={670} y={520} progress={signs[2]} active>Sephora</StoreSign>
      <Character variant="bestie" x={walk} y={1080} scale={1.05} progress={title} />
      <SpeechBubble x={120} y={1450} progress={ease(frame, fps, 72)} accent>
        “Shopping the USA brands on your list.”
      </SpeechBubble>
    </AbsoluteFill>
  );
}

function ProductCard({ title, copy, x, y, progress, accent = false }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 430,
        padding: "28px",
        border: `1px solid ${accent ? "rgba(255,79,154,0.44)" : "rgba(255,216,232,0.22)"}`,
        background: accent ? "rgba(255,79,154,0.14)" : "rgba(255,255,255,0.06)",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [50, 0])}px)`,
      }}
    >
      <strong style={{ color: accent ? ROSE : INK, fontFamily: archivo, fontSize: 34, fontWeight: 900 }}>
        {title}
      </strong>
      <p style={{ margin: "12px 0 0", color: MUTED, fontFamily: archivo, fontSize: 24, lineHeight: 1.32, fontWeight: 700 }}>
        {copy}
      </p>
    </div>
  );
}

function SceneBeautyPick({ frame }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 0);
  const card1 = ease(frame, fps, 14);
  const card2 = ease(frame, fps, 26);
  const card3 = ease(frame, fps, 38);

  return (
    <AbsoluteFill>
      <Background image={IMAGES.makeup} frame={frame} opacity={0.38} />
      <BrandMark />
      <div style={{ position: "absolute", left: 58, right: 58, top: 190, opacity: title }}>
        <Pill>Premium makeup picks</Pill>
        <h2
          style={{
            margin: "28px 0 0",
            color: INK,
            fontFamily: playfair,
            fontSize: 84,
            lineHeight: 0.98,
            fontWeight: 700,
          }}
        >
          Beauty items worth the wait.
        </h2>
      </div>
      <ProductCard title="Sephora finds" copy="Viral blushes, glosses, palettes, and skincare." x={70} y={585} progress={card1} accent />
      <ProductCard title="Coach bags" copy="USA outlet and mall-style finds for everyday luxury." x={585} y={760} progress={card2} />
      <ProductCard title="Tory Burch" copy="Premium accessories and giftable pieces." x={105} y={1045} progress={card3} />
      <SpeechBubble x={455} y={1335} progress={ease(frame, fps, 58)} side="right" accent>
        “We found options that match your need.”
      </SpeechBubble>
    </AbsoluteFill>
  );
}

function Parcel({ progress }) {
  return (
    <div
      style={{
        width: 310,
        height: 240,
        position: "relative",
        opacity: progress,
        transform: `translateY(${interpolate(progress, [0, 1], [50, 0])}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 0,
          height: 162,
          background: "linear-gradient(145deg, #ffd8e8, #ff9cc7)",
          border: "2px solid rgba(255,255,255,0.74)",
          boxShadow: "0 28px 80px rgba(255,79,154,0.34)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 62,
          right: 62,
          top: 24,
          height: 92,
          background: `linear-gradient(145deg, ${PINK}, ${ROSE})`,
          transform: "skewX(-14deg)",
          border: "2px solid rgba(255,255,255,0.68)",
        }}
      />
      <div style={{ position: "absolute", left: 112, right: 112, bottom: 0, top: 38, background: "rgba(7,5,7,0.14)" }} />
      <div
        style={{
          position: "absolute",
          left: 92,
          right: 92,
          bottom: 58,
          padding: "10px 12px",
          background: DARK,
          color: ROSE,
          fontFamily: archivo,
          fontSize: 22,
          fontWeight: 900,
          textAlign: "center",
          letterSpacing: "0.08em",
        }}
      >
        GLOBAL BESTIE
      </div>
    </div>
  );
}

function SceneDelivery({ frame, instagramHandle }) {
  const { fps } = useVideoConfig();
  const title = ease(frame, fps, 0);
  const box = ease(frame, fps, 12);
  const customer = ease(frame, fps, 36);
  const cta = ease(frame, fps, 56);

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
          background: "radial-gradient(circle at 50% 33%, rgba(255,79,154,0.23), transparent 40%)",
        }}
      />
      <Parcel progress={box} />
      <Character variant="customer" x={650} y={620} scale={0.82} progress={customer} />
      <h2
        style={{
          margin: "54px 0 20px",
          color: INK,
          fontFamily: playfair,
          fontSize: 88,
          lineHeight: 0.98,
          textAlign: "center",
          fontWeight: 700,
          opacity: title,
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
          opacity: title,
        }}
      >
        A happy parcel moment, without the USA shopping stress.
      </p>
      <div
        style={{
          padding: "28px 58px",
          background: `linear-gradient(135deg, ${PINK}, ${ROSE})`,
          boxShadow: "0 26px 80px rgba(255,79,154,0.38)",
          opacity: cta,
        }}
      >
        <span style={{ color: DARK, fontFamily: archivo, fontSize: 36, fontWeight: 900 }}>
          DM {instagramHandle}
        </span>
      </div>
    </AbsoluteFill>
  );
}

export const RoleplayReel = ({ instagramHandle = "@globalbestie" }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: DARK }}>
      {frame < 5 * FPS && <SceneDm frame={frame} />}
      {frame >= 5 * FPS && frame < 10 * FPS && <SceneMall frame={frame - 5 * FPS} />}
      {frame >= 10 * FPS && frame < 15 * FPS && <SceneBeautyPick frame={frame - 10 * FPS} />}
      {frame >= 15 * FPS && <SceneDelivery frame={frame - 15 * FPS} instagramHandle={instagramHandle} />}
    </AbsoluteFill>
  );
};

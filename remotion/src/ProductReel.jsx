import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/PlayfairDisplay";

const { fontFamily: playfair } = loadFont();

const PINK = "#ff4f9a";
const ROSE = "#ffd8e8";
const CREAM = "#fff7fb";
const DARK = "#070507";
const MUTED = "#bfaeb7";
const FPS = 30;

function pkr(amount) {
  return `PKR ${Math.ceil(amount).toLocaleString("en-PK")}`;
}

// ── Scene 1 (0–2s): Hero image + brand + title ──────────────────────────────
function Scene1({ title, brand, image_url, frame }) {
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 22, stiffness: 80 } });
  const y = interpolate(p, [0, 1], [60, 0]);

  return (
    <AbsoluteFill style={{ background: DARK }}>
      <AbsoluteFill>
        <Img
          src={image_url}
          style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.88 }}
        />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(7,5,7,0.15) 0%, transparent 38%, rgba(7,5,7,0.88) 100%)",
        }} />
      </AbsoluteFill>

      <AbsoluteFill style={{
        justifyContent: "flex-end",
        alignItems: "flex-start",
        padding: "0 64px 130px",
        opacity: p,
        transform: `translateY(${y}px)`,
      }}>
        <div>
          <p style={{
            margin: "0 0 14px",
            color: PINK,
            fontFamily: "Archivo, sans-serif",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}>
            {brand}
          </p>
          <h1 style={{
            margin: "0 0 28px",
            color: CREAM,
            fontFamily: playfair,
            fontSize: 74,
            fontWeight: 700,
            lineHeight: 1.04,
            maxWidth: 920,
          }}>
            {title}
          </h1>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 22px",
            background: "rgba(255,79,154,0.18)",
            border: "1px solid rgba(255,79,154,0.42)",
          }}>
            <span style={{
              color: ROSE,
              fontFamily: "Archivo, sans-serif",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              USA Preorder · Global Bestie
            </span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Scene 2 (2–5s): Price reveal ────────────────────────────────────────────
function Scene2({ price_pkr, advance_due_pkr, balance_due_pkr, image_url, frame }) {
  const { fps } = useVideoConfig();
  const p1 = spring({ frame, fps, config: { damping: 20, stiffness: 75 } });
  const p2 = spring({ frame: Math.max(0, frame - 14), fps, config: { damping: 20, stiffness: 75 } });
  const p3 = spring({ frame: Math.max(0, frame - 28), fps, config: { damping: 20, stiffness: 75 } });

  const row = (label, value, accent, p) => (
    <div style={{
      width: "100%",
      padding: "30px 48px",
      background: accent ? "rgba(255,79,154,0.12)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${accent ? "rgba(255,79,154,0.36)" : "rgba(255,216,232,0.16)"}`,
      marginBottom: 18,
      opacity: p,
      transform: `translateY(${interpolate(p, [0, 1], [36, 0])}px)`,
    }}>
      <p style={{ margin: 0, color: accent ? PINK : MUTED, fontFamily: "Archivo, sans-serif", fontSize: 24, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </p>
      <p style={{ margin: "10px 0 0", color: accent ? ROSE : CREAM, fontFamily: playfair, fontSize: 72, fontWeight: 700, lineHeight: 1 }}>
        {value}
      </p>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: DARK }}>
      <AbsoluteFill>
        <Img src={image_url} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.14, filter: "blur(28px)" }} />
      </AbsoluteFill>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 500,
        background: "radial-gradient(ellipse at 50% 0%, rgba(255,79,154,0.22), transparent)",
      }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 68px", flexDirection: "column" }}>
        <p style={{
          margin: "0 0 44px",
          color: PINK,
          fontFamily: "Archivo, sans-serif",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          opacity: p1,
        }}>
          Pricing
        </p>
        {row("Total", pkr(price_pkr), false, p1)}
        {row("50% Advance — pay now", pkr(advance_due_pkr), true, p2)}
        {row("Balance — on Pakistan arrival", pkr(balance_due_pkr), false, p3)}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Scene 3 (5–8s): 4-step timeline ─────────────────────────────────────────
const STEPS = [
  "Order Accepted",
  "Sourced in USA",
  "International Transit",
  "Delivered in Pakistan",
];

function Scene3({ frame }) {
  const { fps } = useVideoConfig();
  const header = spring({ frame, fps, config: { damping: 20, stiffness: 80 } });

  return (
    <AbsoluteFill style={{ background: DARK }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 18%, rgba(255,79,154,0.14), transparent 60%)",
      }} />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 68px", flexDirection: "column" }}>
        <p style={{
          margin: "0 0 18px",
          color: PINK,
          fontFamily: "Archivo, sans-serif",
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          opacity: header,
        }}>
          ~4 Week Journey
        </p>
        <h2 style={{
          margin: "0 0 56px",
          fontFamily: playfair,
          color: CREAM,
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.05,
          textAlign: "center",
          opacity: header,
        }}>
          USA to your door.
        </h2>

        {STEPS.map((step, i) => {
          const p = spring({ frame: Math.max(0, frame - i * 10), fps, config: { damping: 20, stiffness: 80 } });
          return (
            <div key={step} style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 30,
              padding: "26px 44px",
              marginBottom: 18,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,216,232,0.15)",
              opacity: p,
              transform: `translateX(${interpolate(p, [0, 1], [-48, 0])}px)`,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                background: `rgba(255,79,154,${0.1 + i * 0.06})`,
                border: "1px solid rgba(255,79,154,0.4)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: PINK, fontFamily: "Archivo, sans-serif", fontSize: 26, fontWeight: 800,
              }}>
                {String(i + 1).padStart(2, "0")}
              </div>
              <p style={{ margin: 0, color: CREAM, fontFamily: "Archivo, sans-serif", fontSize: 34, fontWeight: 700 }}>
                {step}
              </p>
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Scene 4 (8–10s): CTA ────────────────────────────────────────────────────
function Scene4({ frame }) {
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 16, stiffness: 58 } });
  const scale = interpolate(p, [0, 1], [0.88, 1]);

  return (
    <AbsoluteFill style={{
      background: "linear-gradient(150deg, #1a0a13 0%, #070507 55%, #0d050b 100%)",
      justifyContent: "center",
      alignItems: "center",
      padding: "0 70px",
      flexDirection: "column",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at 50% 50%, rgba(255,79,154,0.2), transparent 62%)",
      }} />

      <div style={{
        opacity: p,
        transform: `scale(${scale})`,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 0,
      }}>
        {/* Logo mark */}
        <div style={{
          width: 84, height: 84, borderRadius: "50%",
          background: "linear-gradient(145deg, #ffd8e8, #ff4f9a)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 42,
          fontFamily: playfair, fontSize: 42, fontWeight: 800, color: DARK,
          boxShadow: "0 20px 56px rgba(255,79,154,0.38)",
        }}>
          G
        </div>

        <h2 style={{
          margin: "0 0 24px",
          fontFamily: playfair,
          color: CREAM,
          fontSize: 70,
          fontWeight: 700,
          lineHeight: 1.05,
        }}>
          Order on<br />Global Bestie
        </h2>

        <p style={{
          margin: "0 0 52px",
          color: MUTED,
          fontFamily: "Archivo, sans-serif",
          fontSize: 30,
          lineHeight: 1.55,
          maxWidth: 840,
        }}>
          DM to confirm size &amp; shade.<br />
          50% advance · balance on Pakistan arrival.
        </p>

        {/* CTA button */}
        <div style={{
          padding: "28px 72px",
          background: "linear-gradient(135deg, #ff4f9a, #ffd8e8)",
          borderRadius: 999,
          marginBottom: 32,
          boxShadow: "0 22px 60px rgba(255,79,154,0.38)",
        }}>
          <span style={{
            color: DARK,
            fontFamily: "Archivo, sans-serif",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}>
            DM us to preorder →
          </span>
        </div>

        <p style={{
          margin: 0,
          color: "rgba(191,174,183,0.65)",
          fontFamily: "Archivo, sans-serif",
          fontSize: 26,
          letterSpacing: "0.06em",
        }}>
          globalbestie.com
        </p>
      </div>
    </AbsoluteFill>
  );
}

// ── Root composition ─────────────────────────────────────────────────────────
export const ProductReel = ({
  title,
  brand,
  image_url,
  price_pkr,
  advance_due_pkr,
  balance_due_pkr,
  caption,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill>
      {frame < 2 * FPS && (
        <Scene1 title={title} brand={brand} image_url={image_url} frame={frame} />
      )}
      {frame >= 2 * FPS && frame < 5 * FPS && (
        <Scene2
          price_pkr={price_pkr}
          advance_due_pkr={advance_due_pkr}
          balance_due_pkr={balance_due_pkr}
          image_url={image_url}
          frame={frame - 2 * FPS}
        />
      )}
      {frame >= 5 * FPS && frame < 8 * FPS && (
        <Scene3 frame={frame - 5 * FPS} />
      )}
      {frame >= 8 * FPS && (
        <Scene4 frame={frame - 8 * FPS} caption={caption} />
      )}
    </AbsoluteFill>
  );
};

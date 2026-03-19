import { ImageResponse } from "next/og";

export const alt = "Coding Friend — Claude Code Plugin";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const badges = [
  {
    label: "Plugin",
    color: "#a78bfa",
    borderColor: "#7c3aed",
    bgColor: "rgba(139, 92, 246, 0.15)",
  },
  {
    label: "CLI",
    color: "#7dd3fc",
    borderColor: "#0ea5e9",
    bgColor: "rgba(14, 165, 233, 0.15)",
  },
  {
    label: "Learn Host",
    color: "#6ee7b7",
    borderColor: "#10b981",
    bgColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    label: "Learn MCP",
    color: "#fdba74",
    borderColor: "#f97316",
    bgColor: "rgba(249, 115, 22, 0.15)",
  },
  {
    label: "CF Memory",
    color: "#fcd34d",
    borderColor: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.15)",
  },
];

export default async function Image() {
  const outfitBold = fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf",
  ).then((res) => res.arrayBuffer());

  const outfitRegular = fetch(
    "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf",
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(to bottom, #1e1f26, #21222a, #282a31)",
        position: "relative",
      }}
    >
      {/* Subtle radial gradient overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(ellipse at top, rgba(91, 33, 182, 0.15), transparent 60%)",
          display: "flex",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Logo - green rounded square with sparkle */}
        <svg
          width="72"
          height="72"
          viewBox="0 0 64 64"
          style={{ marginBottom: 16 }}
        >
          <defs>
            <linearGradient
              id="a"
              x1="78.644"
              x2="25.425"
              y1="74.123"
              y2="11.863"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor="#064e3b" />
              <stop offset="1" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <path
            fill="url(#a)"
            fillRule="evenodd"
            d="M2 14C2 7.373 7.373 2 14 2h36c6.627 0 12 5.373 12 12v28c0 6.627-5.373 12-12 12H39.908l-6.403 7.317a2 2 0 0 1-3.01 0L24.093 54H14C7.373 54 2 48.627 2 42z"
            clipRule="evenodd"
          />
          <path
            fill="#ffffff"
            d="M32 14a2 2 0 0 1 1.95 1.556l1.107 4.867a6 6 0 0 0 4.52 4.52l4.867 1.107a2 2 0 0 1 0 3.9l-4.867 1.107a6 6 0 0 0-4.52 4.52l-1.107 4.866a2 2 0 0 1-3.9 0l-1.107-4.866a6 6 0 0 0-4.52-4.52l-4.866-1.107a2 2 0 0 1 0-3.9l4.866-1.107a6 6 0 0 0 4.52-4.52l1.107-4.866A2 2 0 0 1 32 14z"
          />
        </svg>

        {/* Title */}
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: "#ffffff",
            textAlign: "center",
            lineHeight: 1.15,
            fontFamily: "Outfit",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <span>Coding&nbsp;</span>
          <span style={{ color: "#a78bfa" }}>Friend</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 400,
            color: "#94a3b8",
            textAlign: "center",
            marginTop: 8,
            fontFamily: "Outfit",
          }}
        >
          Disciplined Engineering Workflows for Claude Code
        </div>

        {/* Ecosystem badges */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 10,
            marginTop: 32,
          }}
        >
          {badges.map((badge) => (
            <div
              key={badge.label}
              style={{
                display: "flex",
                alignItems: "center",
                fontSize: 15,
                fontWeight: 500,
                fontFamily: "Outfit",
                color: badge.color,
                background: badge.bgColor,
                border: `1.5px solid ${badge.borderColor}40`,
                borderRadius: 999,
                padding: "6px 18px",
              }}
            >
              {badge.label}
            </div>
          ))}
        </div>

        {/* Description */}
        <div
          style={{
            fontSize: 18,
            color: "#cbd5e1",
            textAlign: "center",
            maxWidth: 680,
            lineHeight: 1.5,
            marginTop: 28,
            fontFamily: "Outfit",
          }}
        >
          TDD · Systematic Debugging · Smart Commits · Code Review · Knowledge
          Capture
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Outfit",
          data: await outfitRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Outfit",
          data: await outfitBold,
          style: "normal",
          weight: 700,
        },
      ],
    },
  );
}

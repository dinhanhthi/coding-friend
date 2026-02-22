import { ImageResponse } from "next/og";

export const alt = "Coding Friend - Disciplined Engineering Workflows for Claude Code";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const interBold = fetch(
    "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf"
  ).then((res) => res.arrayBuffer());

  const interRegular = fetch(
    "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(to bottom, #0a0e27, #0f1629, #111827)",
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
            width="80"
            height="80"
            viewBox="0 0 64 64"
            style={{ marginBottom: 20 }}
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

          {/* Plugin label */}
          <div
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 16,
              fontFamily: "Inter",
            }}
          >
            Claude Code Plugin
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#ffffff",
              textAlign: "center",
              lineHeight: 1.15,
              fontFamily: "Inter",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <span>Disciplined Engineering&nbsp;</span>
            <span style={{ color: "#a78bfa" }}>Workflows</span>
          </div>

          {/* Description */}
          <div
            style={{
              fontSize: 22,
              color: "#cbd5e1",
              textAlign: "center",
              maxWidth: 700,
              lineHeight: 1.5,
              marginTop: 24,
              fontFamily: "Inter",
            }}
          >
            A lean toolkit that enforces TDD, systematic debugging, smart
            commits, code review, and knowledge capture.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Inter",
          data: await interRegular,
          style: "normal",
          weight: 400,
        },
        {
          name: "Inter",
          data: await interBold,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}

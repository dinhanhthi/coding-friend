import { ImageResponse } from "next/og";

export const alt = "Coding Friend";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "Coding Friend";
const SUBTITLE =
  "Coding Friend adds skills, agents, and hooks to the agent you already use.";
const ASCII = "you → /cf-* → agents → repo";

type OgFont = {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 400 | 700;
};

async function loadInter(
  weight: 400 | 700,
  text: string,
): Promise<OgFont | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await fetch(url, {
      headers: {
        // Safari 5 UA so css2 returns TTF (satori cannot parse woff2).
        "User-Agent":
          "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
      },
      cache: "force-cache",
    }).then((res) => {
      if (!res.ok) throw new Error(`css ${res.status}`);
      return res.text();
    });

    const resource = css.match(
      /src: url\((.+)\) format\('(opentype|truetype|woff)'\)/,
    );
    if (!resource?.[1]) return null;

    const fontRes = await fetch(resource[1], { cache: "force-cache" });
    if (fontRes.status !== 200) return null;

    return {
      name: "Inter",
      data: await fontRes.arrayBuffer(),
      style: "normal",
      weight,
    };
  } catch {
    return null;
  }
}

export default async function Image() {
  const subset = `${TITLE} ${SUBTITLE} ${ASCII}`;
  const fonts = (
    await Promise.all([loadInter(400, subset), loadInter(700, subset)])
  ).filter((font): font is OgFont => font !== null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#23262e",
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 700,
          color: "#f5f5f7",
          fontFamily: "Inter",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {TITLE}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 24,
          fontWeight: 400,
          color: "#9a9ca6",
          fontFamily: "Inter",
          textAlign: "center",
          marginTop: 20,
          maxWidth: 920,
          lineHeight: 1.4,
        }}
      >
        {SUBTITLE}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 18,
          fontWeight: 400,
          color: "#a78bfa",
          fontFamily: "Inter",
          marginTop: 40,
        }}
      >
        {ASCII}
      </div>
    </div>,
    {
      ...size,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}

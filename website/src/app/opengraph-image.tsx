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
  weight: 400 | 600;
};

async function loadGeist(
  weight: 400 | 600,
  text: string,
): Promise<OgFont | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Geist:wght@${weight}&text=${encodeURIComponent(text)}`;
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
      name: "Geist",
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
    await Promise.all([loadGeist(400, subset), loadGeist(600, subset)])
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
        background: "#fafafa",
        padding: 80,
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 600,
          color: "#18181b",
          fontFamily: "Geist",
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
          color: "#71717a",
          fontFamily: "Geist",
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
          color: "#71717a",
          fontFamily: "Geist",
          marginTop: 40,
          paddingTop: 24,
          borderTop: "1px solid #e4e4e7",
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

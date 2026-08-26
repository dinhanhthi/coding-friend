export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Coding Friend",
    description:
      "A lean toolkit for systematic debugging, smart commits, code review, and knowledge capture — with optional TDD support across your engineering workflow.",
    url: "https://cf.dinhanhthi.com",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Cross-platform",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: "Anh-Thi Dinh",
      url: "https://dinhanhthi.com",
    },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1>Coding Friend</h1>
    </main>
  );
}

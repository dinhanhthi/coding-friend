"use strict";

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const frontmatter = {};
  const lines = match[1].split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const simple = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!simple) continue;

    const [, key, rawValue = ""] = simple;
    if (rawValue === ">") {
      const folded = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      frontmatter[key] = folded.join(" ").replace(/\s+/g, " ").trim();
    } else {
      frontmatter[key] = rawValue.trim();
    }
  }

  return {
    frontmatter,
    body: markdown.slice(match[0].length),
  };
}

function tomlString(value) {
  return JSON.stringify(value ?? "");
}

function tomlLiteralMultiline(value) {
  const normalized = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (normalized.includes("'''")) {
    throw new Error(
      "Agent markdown contains unsupported TOML literal delimiter",
    );
  }
  return `'''\n${normalized}\n'''`;
}

function agentMarkdownToToml(markdown, { renderText = (value) => value } = {}) {
  const rendered = renderText(markdown);
  const { frontmatter, body } = parseFrontmatter(rendered);
  const name = frontmatter.name;
  if (!name) {
    throw new Error("Agent markdown is missing frontmatter name");
  }

  const lines = [
    `name = ${tomlString(name)}`,
    `description = ${tomlString(frontmatter.description ?? "")}`,
  ];

  const reasoningEffort = {
    haiku: "low",
    sonnet: "medium",
    opus: "high",
  }[frontmatter.model];
  if (reasoningEffort) {
    lines.push(`model_reasoning_effort = ${tomlString(reasoningEffort)}`);
  }

  lines.push(`developer_instructions = ${tomlLiteralMultiline(body.trim())}`);
  return `${lines.join("\n")}\n`;
}

module.exports = {
  agentMarkdownToToml,
  parseFrontmatter,
};

export interface DocFrontmatter {
  title: string;
  description: string;
  section?: string;
  order?: number;
}

export interface DocMeta {
  slug: string;
  frontmatter: DocFrontmatter;
}

export interface Doc extends DocMeta {
  content: string;
}

export interface NavItem {
  title: string;
  slug: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface TocItem {
  id: string;
  text: string;
  level: number;
}

export interface ChangelogEntry {
  version: string;
  changes: ChangelogChange[];
}

export interface ChangelogChange {
  text: string;
  tag: "new" | "improved" | "fixed" | "removed" | "security";
}

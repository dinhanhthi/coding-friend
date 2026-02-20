export interface DocFrontmatter {
  title: string;
  category: string;
  tags: string[];
  created: string;
  updated: string;
}

export interface DocMeta {
  slug: string;
  category: string;
  frontmatter: DocFrontmatter;
  excerpt: string;
}

export interface Doc extends DocMeta {
  content: string;
}

export interface CategoryInfo {
  name: string;
  docCount: number;
}
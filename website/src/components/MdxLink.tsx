import type { AnchorHTMLAttributes, ReactNode } from "react";

const LINK_CLASS =
  "text-link no-underline underline-offset-4 transition-colors duration-150 hover:text-heading hover:underline";

function isDangerousHref(href: string): boolean {
  return /^(javascript|data):/i.test(href.trim());
}

function isExternalHref(href: string): boolean {
  const trimmed = href.trim();
  return trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

function InertLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={className ? `${LINK_CLASS} ${className}` : LINK_CLASS}>
      {children}
    </span>
  );
}

export default function MdxLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  const { href, children, className, ...rest } = props;
  const linkClass = className ? `${LINK_CLASS} ${className}` : LINK_CLASS;

  if (!href || isDangerousHref(href)) {
    return <InertLink className={className}>{children}</InertLink>;
  }

  if (href.startsWith("#")) {
    return (
      <a {...rest} href={href} className={linkClass}>
        {children}
      </a>
    );
  }

  if (isExternalHref(href)) {
    return (
      <a
        {...rest}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {children}
      </a>
    );
  }

  return (
    <a {...rest} href={href} className={linkClass}>
      {children}
    </a>
  );
}

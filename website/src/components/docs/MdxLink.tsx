import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

export default function MdxLink(
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
) {
  const { href, children, ...rest } = props;

  if (!href) {
    return <a {...props} />;
  }

  // Anchor links stay as-is
  if (href.startsWith("#")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }

  // Internal links use Next.js Link for client-side navigation
  if (href.startsWith("/")) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    );
  }

  // External links open in new tab
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
      {children}
    </a>
  );
}

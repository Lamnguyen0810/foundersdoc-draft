"use client";

import Link from "next/link";
import { track } from "@/lib/track";

/**
 * The "Draft my … free" button on the template pages. Counted as a
 * launch_fdai_click with source "template:<doc>:<country>", so the daily
 * report can tell which template page sends people to FD AI.
 */
export default function TemplateCta({
  href,
  label,
  source,
  className = "btn btn-gold tpl-cta",
}: {
  href: string;
  label: string;
  source: string;
  className?: string;
}) {
  return (
    <Link className={className} href={href} onClick={() => track("launch_fdai_click", { source: source.slice(0, 80) })}>
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  );
}

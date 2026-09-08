"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";

/** Small ID badge shown at the bottom of every node — click to copy. */
export default function NodeIdBadge({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 text-[9px] text-muted-foreground font-mono cursor-pointer hover:text-foreground transition-colors border-t border-border/50"
      onClick={handleCopy}
      title="Click to copy node ID"
    >
      {copied ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
      <span className="truncate">{id}</span>
    </div>
  );
}

import { useEffect, useState } from "react";
import { detectTools } from "@/lib/launch-ipc";
import { ALL_TOOL_IDS } from "@/lib/tool-catalog";
import type { Detected } from "@/types/launch";

/** Detect all known tools once; returns availability keyed by tool id. Never
 *  blocks the form — save is independent of detection (Phase 4 risk note). */
export function useDetectedTools() {
  const [availability, setAvailability] = useState<Record<string, Detected>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    detectTools(ALL_TOOL_IDS)
      .then((results) => {
        if (active) {
          setAvailability(Object.fromEntries(results.map((d) => [d.id, d])));
        }
      })
      .catch(() => {
        /* detection is best-effort; ignore */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { availability, loading };
}

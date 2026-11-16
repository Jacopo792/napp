import { useEffect, useState } from "react";
import { isUsageAdministrator, listUsageActivity, type UsageRow } from "./usage";

export function useUsageAdministrator(accountKey: string) {
  const [allowed, setAllowed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void isUsageAdministrator()
      .then((yes) => {
        if (!cancelled) setAllowed(yes ? accountKey : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accountKey]);
  return allowed === accountKey;
}

export function useUsageDashboard(enabled: boolean) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void listUsageActivity(search.trim(), offset)
        .then((next) => {
          if (!cancelled) setRows(next);
        })
        .catch((reason: unknown) => {
          if (!cancelled) {
            setRows([]);
            setError(reason instanceof Error ? reason.message : "Could not load activity");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, search, offset, revision]);
  return {
    rows,
    search,
    offset,
    loading,
    error,
    total: Number(rows[0]?.total_count ?? 0),
    setSearch: (value: string) => {
      setSearch(value);
      setOffset(0);
    },
    setOffset,
    refresh: () => setRevision((value) => value + 1),
  };
}

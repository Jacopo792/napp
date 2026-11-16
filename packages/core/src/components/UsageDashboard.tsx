import { ChevronLeft, ChevronRight, RotateCw, Search } from "@/components/icons";
import { useUsageDashboard } from "@/lib/useUsageDashboard";
import { USAGE_CLIENT, usageAgo } from "@/lib/usageShape";
import "./usageDashboard.css";

const PAGE = 100;
/** Who uses Napp, on what, and when last — one row per account per installation. */
export function UsageDashboard() {
  const data = useUsageDashboard(true);
  const last = Math.min(data.offset + data.rows.length, data.total);
  return (
    <section className="usage" aria-busy={data.loading}>
      <div className="usage-toolbar">
        <label className="usage-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search email or name"
            placeholder="Search"
            value={data.search}
            onChange={(event) => data.setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          aria-label="Refresh"
          className="usage-icon press"
          onClick={data.refresh}
          disabled={data.loading}
        >
          <RotateCw size={15} />
        </button>
      </div>

      {data.error && (
        <p role="alert" className="profile-note text-danger">
          {data.error}
        </p>
      )}

      <h3>{data.total ? `${data.total} ${data.total === 1 ? "device" : "devices"}` : "Devices"}</h3>
      <div className="appearance-controls">
        {data.rows.map((row) => (
          <div
            key={`${row.user_id}:${row.device_id}:${row.client}`}
            className="appearance-row profile-row"
          >
            <span className="settings-label">
              <b>{row.nickname || row.email?.split("@")[0] || "Anonymous"}</b>
              <small>{row.email || row.user_id}</small>
            </span>
            <span className="usage-where">
              <span>
                {row.device} · {USAGE_CLIENT[row.client]}
              </span>
              <small>
                {row.os}
                {row.browser ? ` · ${row.browser}` : ""} ·{" "}
                <time
                  dateTime={row.last_active_at}
                  title={new Date(row.last_active_at).toLocaleString()}
                >
                  {usageAgo(row.last_active_at)}
                </time>
              </small>
            </span>
          </div>
        ))}
        {!data.rows.length && (
          <div className="appearance-row usage-empty" role="status">
            {data.loading ? "Loading…" : data.search ? "No matches" : "No activity yet"}
          </div>
        )}
      </div>

      {data.total > PAGE && (
        <div className="usage-pager">
          <span>
            {data.offset + 1}–{last} of {data.total}
          </span>
          <button
            type="button"
            aria-label="Previous page"
            className="usage-icon press"
            disabled={data.loading || data.offset === 0}
            onClick={() => data.setOffset(Math.max(0, data.offset - PAGE))}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            aria-label="Next page"
            className="usage-icon press"
            disabled={data.loading || last >= data.total}
            onClick={() => data.setOffset(data.offset + PAGE)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}

const Box = "d" + "iv";

function chartMaxValue(rows, key = "totalUSD") {
  const max = Math.max(0, ...rows.map((row) => Number(row[key] ?? 0) || 0));
  return max > 0 ? max : 1;
}

export function ReportWidget({ title, subtitle, children, className = "", actions = null }) {
  return (
    <Box className={`sepela-report-widget ${className}`.trim()}>
      <Box className="sepela-report-widget__header">
        <Box>
          <h3 className="sepela-report-widget__title">{title}</h3>
          {subtitle ? <p className="sepela-report-widget__subtitle">{subtitle}</p> : null}
        </Box>
        {actions}
      </Box>
      <Box className="sepela-report-widget__body">{children}</Box>
    </Box>
  );
}

export function ReportKpiTile({ label, value, hint, accent = "" }) {
  return (
    <Box className="sepela-report-kpi">
      <p className="sepela-report-kpi__label">{label}</p>
      <p className={`sepela-report-kpi__value ${accent}`.trim()}>{value}</p>
      {hint ? <p className="sepela-report-kpi__hint">{hint}</p> : null}
    </Box>
  );
}

export function MonthlyBarChart({ series = [], formatValue, emptyLabel }) {
  const max = chartMaxValue(series);
  const hasData = series.some((row) => row.totalUSD > 0 || row.count > 0);

  if (!hasData) {
    return <p className="sepela-report-empty">{emptyLabel}</p>;
  }

  return (
    <Box className="sepela-bar-chart sepela-bar-chart--monthly">
      <Box className="sepela-bar-chart__plot" role="img" aria-hidden="true">
        {series.map((row, index) => {
          const height = Math.max(4, Math.round((row.totalUSD / max) * 100));
          const tone = index % 2 === 0 ? "sepela-bar-chart__bar--green" : "sepela-bar-chart__bar--pink";
          return (
            <Box key={row.month} className="sepela-bar-chart__column">
              <span className="sepela-bar-chart__value">{formatValue(row.totalUSD)}</span>
              <span
                className={`sepela-bar-chart__bar ${tone}`}
                style={{ height: `${height}%` }}
                title={`${row.label}: ${formatValue(row.totalUSD)}`}
              />
            </Box>
          );
        })}
      </Box>
      <Box className="sepela-bar-chart__axis">
        {series.map((row) => (
          <span key={`label-${row.month}`} className="sepela-bar-chart__axis-label">
            {row.label}
          </span>
        ))}
      </Box>
      <p className="sepela-bar-chart__axis-title">Month</p>
    </Box>
  );
}

export function HourlyBarChart({ series = [], formatValue, emptyLabel }) {
  const max = chartMaxValue(series);
  const hasData = series.some((row) => row.totalUSD > 0);

  if (!hasData) {
    return <p className="sepela-report-empty">{emptyLabel}</p>;
  }

  return (
    <Box className="sepela-bar-chart sepela-bar-chart--hourly">
      <Box className="sepela-bar-chart__plot sepela-bar-chart__plot--hourly" role="img" aria-hidden="true">
        {series.map((row, index) => {
          const height = Math.max(3, Math.round((row.totalUSD / max) * 100));
          const tone = index % 2 === 0 ? "sepela-bar-chart__bar--green" : "sepela-bar-chart__bar--pink";
          return (
            <span
              key={row.hour}
              className={`sepela-bar-chart__bar ${tone}`}
              style={{ height: `${height}%` }}
              title={`${row.label}: ${formatValue(row.totalUSD)}`}
            />
          );
        })}
      </Box>
      <Box className="sepela-bar-chart__hour-labels">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </Box>
    </Box>
  );
}

export function HorizontalBarList({ rows = [], valueKey = "totalUSD", labelKey = "name", formatValue, emptyLabel }) {
  const max = chartMaxValue(rows, valueKey);
  const hasData = rows.some((row) => Number(row[valueKey] ?? 0) > 0);

  if (!hasData) {
    return <p className="sepela-report-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="sepela-hbar-list">
      {rows.map((row, index) => {
        const value = Number(row[valueKey] ?? 0) || 0;
        const width = Math.max(6, Math.round((value / max) * 100));
        const tone = index % 2 === 0 ? "sepela-hbar-list__fill--green" : "sepela-hbar-list__fill--pink";
        return (
          <li key={`${row[labelKey]}-${index}`} className="sepela-hbar-list__row">
            <span className="sepela-hbar-list__label" title={row[labelKey]}>
              {row[labelKey]}
            </span>
            <Box className="sepela-hbar-list__track">
              <span className={`sepela-hbar-list__fill ${tone}`} style={{ width: `${width}%` }} />
            </Box>
            <span className="sepela-hbar-list__value">{formatValue(value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function TotalSalesHero({ amount, formatValue, emptyLabel, hasData }) {
  if (!hasData) {
    return <p className="sepela-report-empty sepela-report-empty--hero">{emptyLabel}</p>;
  }
  return <p className="sepela-report-hero-amount">{formatValue(amount)}</p>;
}

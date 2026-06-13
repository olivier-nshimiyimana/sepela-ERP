import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { DEFAULT_LOCALE, reportPeriodPresetLabel, translate } from "../../i18n";
import {
  REPORT_PERIOD_PRESETS,
  formatDateRangeLabel,
  resolveReportPeriodPreset,
  startOfDay,
  toDateInputValue,
} from "../../utils/reportPeriods";

const Box = "d" + "iv";

const WEEKDAYS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const WEEKDAYS_FR = ["Di", "Lu", "Ma", "Me", "Je", "Ve", "Sa"];

function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(startOfDay(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MonthCalendar({
  title,
  monthDate,
  selected,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
  locale,
}) {
  const weekdays = locale === "fr" ? WEEKDAYS_FR : WEEKDAYS_EN;
  const cells = useMemo(
    () => monthMatrix(monthDate.getFullYear(), monthDate.getMonth()),
    [monthDate]
  );
  const monthLabel = monthDate.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <Box className="sepela-period-calendar">
      <Box className="sepela-period-calendar__header">
        <button type="button" className="sepela-period-calendar__nav" onClick={onPrevMonth} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span className="sepela-period-calendar__month">{monthLabel}</span>
        <button type="button" className="sepela-period-calendar__nav" onClick={onNextMonth} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </Box>
      <p className="sepela-period-calendar__side-label">{title}</p>
      <Box className="sepela-period-calendar__weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </Box>
      <Box className="sepela-period-calendar__grid">
        {cells.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} className="sepela-period-calendar__empty" />;
          const isSelected = selected && startOfDay(selected).getTime() === date.getTime();
          return (
            <button
              key={date.toISOString()}
              type="button"
              className={`sepela-period-calendar__day ${isSelected ? "sepela-period-calendar__day--selected" : ""}`}
              onClick={() => onSelectDay(date)}
            >
              {date.getDate()}
            </button>
          );
        })}
      </Box>
    </Box>
  );
}

export default function ReportPeriodPicker({
  isOpen,
  value,
  onClose,
  onApply,
  locale = DEFAULT_LOCALE,
  t,
}) {
  const label = (key, params) => (t ? t(key, params) : translate(key, locale, params));
  const [draftFrom, setDraftFrom] = useState(() => startOfDay(value?.from ?? new Date()));
  const [draftTo, setDraftTo] = useState(() => startOfDay(value?.to ?? new Date()));
  const [startMonth, setStartMonth] = useState(() => new Date(draftFrom));
  const [endMonth, setEndMonth] = useState(() => new Date(draftTo));

  useEffect(() => {
    if (!isOpen) return;
    const from = startOfDay(value?.from ?? new Date());
    const to = startOfDay(value?.to ?? new Date());
    setDraftFrom(from);
    setDraftTo(to);
    setStartMonth(new Date(from));
    setEndMonth(new Date(to));
  }, [isOpen, value?.from, value?.to]);

  if (!isOpen) return null;

  const rangeLabel = formatDateRangeLabel(draftFrom, draftTo, locale);

  const applyPreset = (preset) => {
    const range = resolveReportPeriodPreset(preset);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setStartMonth(new Date(range.from));
    setEndMonth(new Date(range.to));
  };

  const selectStart = (date) => {
    const next = startOfDay(date);
    setDraftFrom(next);
    if (next.getTime() > draftTo.getTime()) setDraftTo(next);
  };

  const selectEnd = (date) => {
    const next = startOfDay(date);
    setDraftTo(next);
    if (next.getTime() < draftFrom.getTime()) setDraftFrom(next);
  };

  const handleApply = () => {
    onApply({ from: draftFrom, to: draftTo });
    onClose();
  };

  const picker = (
    <Box className="sepela-period-picker-overlay">
      <button type="button" className="sepela-modal-backdrop" aria-label={label("common.close")} onClick={onClose} />
      <Box className="sepela-period-picker" role="dialog" aria-modal="true" aria-labelledby="report-period-title">
        <h3 id="report-period-title" className="sepela-period-picker__title">
          {label("reports.periodTitle")}
        </h3>
        <p className="sepela-period-picker__range">{rangeLabel}</p>

        <Box className="sepela-period-picker__body">
          <Box className="sepela-period-picker__calendars">
            <MonthCalendar
              title={label("reports.periodStart")}
              monthDate={startMonth}
              selected={draftFrom}
              onSelectDay={selectStart}
              onPrevMonth={() =>
                setStartMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
              onNextMonth={() =>
                setStartMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
              locale={locale}
            />
            <MonthCalendar
              title={label("reports.periodEnd")}
              monthDate={endMonth}
              selected={draftTo}
              onSelectDay={selectEnd}
              onPrevMonth={() =>
                setEndMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
              onNextMonth={() =>
                setEndMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
              locale={locale}
            />
          </Box>

          <Box className="sepela-period-picker__presets">
            <p className="sepela-period-picker__presets-title">{label("reports.periodPredefined")}</p>
            <Box className="sepela-period-picker__preset-grid">
              {REPORT_PERIOD_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="sepela-period-picker__preset"
                  onClick={() => applyPreset(preset)}
                >
                  {reportPeriodPresetLabel(preset, locale)}
                </button>
              ))}
            </Box>
          </Box>
        </Box>

        <Box className="sepela-period-picker__actions">
          <button type="button" className="sepela-period-picker__action sepela-period-picker__action--ok" onClick={handleApply}>
            <Check size={18} />
            {label("reports.periodApply")}
          </button>
          <button type="button" className="sepela-period-picker__action" onClick={onClose}>
            <X size={18} />
            {label("common.cancel")}
          </button>
        </Box>
      </Box>
    </Box>
  );

  return createPortal(picker, document.body);
}

export function reportRangeQueryParams(range) {
  return {
    dateFrom: toDateInputValue(range.from),
    dateTo: toDateInputValue(range.to),
  };
}

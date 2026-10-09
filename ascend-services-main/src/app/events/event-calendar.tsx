"use client";

import { useMemo, useState } from "react";

export interface CalendarEvent {
  id: string;
  title: string;
  details: string;
  location: string;
  link: string;
  startsAt: string;
  endsAt: string | null;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const whenLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "full", timeStyle: "short" });

export function EventCalendar({ events }: { events: CalendarEvent[] }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const days = useMemo(() => buildMonth(cursor), [cursor]);
  const selected = events.find((event) => event.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => shiftMonth(cursor, -1, setCursor)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ascend-navy ring-1 ring-ascend-navy/10">
          Previous
        </button>
        <h2 className="font-display text-3xl text-ascend-navy">{monthLabel.format(cursor)}</h2>
        <button type="button" onClick={() => shiftMonth(cursor, 1, setCursor)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ascend-navy ring-1 ring-ascend-navy/10">
          Next
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-md ring-1 ring-ascend-navy/5">
        <div className="grid grid-cols-7 bg-ascend-navy text-center text-xs font-semibold uppercase tracking-wide text-white">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-3">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const key = dayKey(day);
            const dayEvents = events.filter((event) => dayKey(new Date(event.startsAt)) === key);
            return (
              <div key={key} className={`min-h-28 border-t border-ascend-navy/10 p-2 sm:min-h-36 ${inMonth ? "bg-white" : "bg-ascend-bg"}`}>
                <p className={`text-sm font-semibold ${inMonth ? "text-ascend-navy" : "text-ascend-navy/40"}`}>
                  {day.getDate()}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {dayEvents.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(event.id)}
                        className="w-full truncate rounded-lg bg-ascend-sky/30 px-2 py-1 text-left text-xs font-semibold text-ascend-navy hover:bg-ascend-sky/50"
                      >
                        {event.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <article className="rounded-3xl bg-white p-6 shadow-md ring-1 ring-ascend-navy/5">
          <h3 className="font-display text-2xl text-ascend-navy">{selected.title}</h3>
          <p className="mt-2 text-sm text-ascend-sky-deep">{whenLabel.format(new Date(selected.startsAt))}</p>
          {selected.endsAt ? (
            <p className="text-sm text-ascend-navy/70">Until {whenLabel.format(new Date(selected.endsAt))}</p>
          ) : null}
          {selected.location ? <p className="mt-3 text-ascend-navy">{selected.location}</p> : null}
          {selected.details ? <p className="mt-3 whitespace-pre-wrap text-ascend-navy/80">{selected.details}</p> : null}
          {selected.link ? (
            <a href={selected.link} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold text-ascend-sky-deep underline">
              More information
            </a>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

function shiftMonth(cursor: Date, delta: number, setCursor: (value: Date) => void) {
  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
}

function buildMonth(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function dayKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

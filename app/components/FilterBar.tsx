"use client";

import * as React from "react";
import {
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
  subMonths,
} from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
export interface FilterValues {
  account_id: string;
  start_date: string;
  end_date: string;
  deal_owner?: string;
  enterprise_midmarket?: string;
  reply_text?: string;
  month?: string;
}

interface FilterBarProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onApply: () => void;
  /** Date pickers limited to the previous calendar month through the end of the current month. */
  restrictToMonthPresets?: boolean;
}

function toDate(s: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function toYYYYMMDD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Earliest day through latest day users may pick: full previous calendar month + full current month. */
function dashboardSelectableBounds(now: Date = new Date()) {
  const monthMin = startOfDay(startOfMonth(subMonths(now, 1)));
  const monthMax = startOfDay(endOfMonth(now));
  const navStartMonth = startOfMonth(subMonths(now, 1));
  const navEndMonth = startOfMonth(now);
  return { monthMin, monthMax, navStartMonth, navEndMonth };
}

function isDayInSelectableRange(d: Date, now?: Date) {
  const { monthMin, monthMax } = dashboardSelectableBounds(now);
  const x = startOfDay(d);
  return !isBefore(x, monthMin) && !isAfter(x, monthMax);
}

function clampFiltersToSelectableRange(values: FilterValues): Partial<FilterValues> | null {
  const { monthMin, monthMax } = dashboardSelectableBounds();
  let s = toDate(values.start_date);
  let e = toDate(values.end_date);
  if (!s && !e) return null;
  if (!s) s = startOfMonth(new Date());
  if (!e) e = endOfMonth(new Date());
  let cs = s;
  let ce = e;
  if (isBefore(startOfDay(cs), monthMin)) cs = monthMin;
  if (isAfter(startOfDay(cs), monthMax)) cs = monthMax;
  if (isBefore(startOfDay(ce), monthMin)) ce = monthMin;
  if (isAfter(startOfDay(ce), monthMax)) ce = monthMax;
  if (isAfter(startOfDay(cs), startOfDay(ce))) ce = cs;
  const ns = toYYYYMMDD(cs);
  const ne = toYYYYMMDD(ce);
  if (ns === values.start_date && ne === values.end_date) return null;
  return { start_date: ns, end_date: ne };
}

export function FilterBar({
  values,
  onChange,
  onApply,
  restrictToMonthPresets = false,
}: FilterBarProps) {
  const startDate = toDate(values.start_date);
  const endDate = toDate(values.end_date);

  React.useEffect(() => {
    if (!restrictToMonthPresets) return;
    const clamped = clampFiltersToSelectableRange(values);
    if (clamped) onChange({ ...values, ...clamped });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictToMonthPresets, values.start_date, values.end_date]);

  const { navStartMonth, navEndMonth } = dashboardSelectableBounds();

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="grid w-full min-w-[140px] max-w-[200px] gap-2">
        <Label htmlFor="account_id">Account ID</Label>
        <Input
          id="account_id"
          placeholder="e.g. 123"
          value={values.account_id}
          onChange={(e) =>
            onChange({ ...values, account_id: e.target.value.trim() })
          }
        />
      </div>
      {restrictToMonthPresets ? (
        <>
          <div className="grid gap-2">
            <Label>Start date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {startDate ? toYYYYMMDD(startDate) : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  captionLayout="label"
                  startMonth={navStartMonth}
                  endMonth={navEndMonth}
                  disabled={(date) => !isDayInSelectableRange(date)}
                  defaultMonth={startDate ?? navEndMonth}
                  selected={startDate}
                  onSelect={(d) => {
                    if (!d) return;
                    const nextStart = toYYYYMMDD(d);
                    const e = endDate;
                    if (e && startOfDay(d) > startOfDay(e)) {
                      onChange({ ...values, start_date: nextStart, end_date: nextStart });
                    } else {
                      onChange({ ...values, start_date: nextStart });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label>End date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {endDate ? toYYYYMMDD(endDate) : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  captionLayout="label"
                  startMonth={navStartMonth}
                  endMonth={navEndMonth}
                  disabled={(date) => {
                    if (!isDayInSelectableRange(date)) return true;
                    if (startDate && isBefore(startOfDay(date), startOfDay(startDate))) return true;
                    return false;
                  }}
                  defaultMonth={endDate ?? navEndMonth}
                  selected={endDate}
                  onSelect={(d) => {
                    if (!d) return;
                    const nextEnd = toYYYYMMDD(d);
                    const s = startDate;
                    if (s && startOfDay(d) < startOfDay(s)) {
                      onChange({ ...values, start_date: nextEnd, end_date: nextEnd });
                    } else {
                      onChange({ ...values, end_date: nextEnd });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            <Label>Start date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {startDate ? toYYYYMMDD(startDate) : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(d) =>
                    d && onChange({ ...values, start_date: toYYYYMMDD(d) })
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label>End date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal",
                    !endDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {endDate ? toYYYYMMDD(endDate) : "Pick date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(d) =>
                    d && onChange({ ...values, end_date: toYYYYMMDD(d) })
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
      <Button onClick={onApply}>Apply</Button>
    </div>
  );
}

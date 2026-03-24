export function getMonthStartString(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function getNextMonthStart(monthStart: string) {
  const [yearStr, monthStr] = monthStart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (month === 12) {
    return `${year + 1}-01-01`;
  }

  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function getCurrentYearMonth() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

export function getCurrentMonthStart() {
  const { year, month } = getCurrentYearMonth();
  return getMonthStartString(year, month);
}

export function getCurrentYear() {
  return new Date().getFullYear();
}

export function getYearOptions(startYear = 2024, endYear = getCurrentYear()) {
  const years: number[] = [];
  for (let y = endYear; y >= startYear; y--) {
    years.push(y);
  }
  return years;
}

export function monthLabel(month: number) {
  return `${month}月`;
}
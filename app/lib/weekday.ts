export type WeekdayStep = {
  name: string
  label: string
  value: number
  explain: string
}

export type WeekdayResult = {
  input: string
  year: number
  month: number
  day: number
  steps: WeekdayStep[]
  weekdayIndex: number
  weekdayName: string
  weekdayJa: string
  isLeapYear: boolean
  leapAdjust: number
  yearCode: number
}

export type WeekdayQuestion = {
  id: string
  date: string
  result: WeekdayResult
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const WEEKDAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土'] as const

export const MONTH_CODES: Record<number, number> = {
  1: 0,
  2: 3,
  3: 3,
  4: 6,
  5: 1,
  6: 4,
  7: 6,
  8: 2,
  9: 5,
  10: 0,
  11: 3,
  12: 5,
}

export const CENTURY_CODES: Record<number, number> = {
  1500: 0,
  1600: 6,
  1700: 4,
  1800: 2,
  1900: 0,
  2000: 6,
  2100: 4,
  2200: 2,
  2300: 0,
  2400: 6,
  2500: 4,
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function parseDate(input: string): { year: number; month: number; day: number } | null {
  const trimmed = input.trim()
  const sep = trimmed.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/)
  if (sep) {
    return {
      year: Number(sep[1]),
      month: Number(sep[2]),
      day: Number(sep[3]),
    }
  }
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    return {
      year: Number(compact[1]),
      month: Number(compact[2]),
      day: Number(compact[3]),
    }
  }
  return null
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function isValidGregorianDate(year: number, month: number, day: number): boolean {
  if (year < 1500 || year > 2500) return false
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function calculateWeekday(input: string): WeekdayResult | null {
  const parsed = parseDate(input)
  if (!parsed) return null

  const { year, month, day } = parsed
  if (!isValidGregorianDate(year, month, day)) return null

  const centuryBase = Math.floor(year / 100) * 100
  const centuryCode = CENTURY_CODES[centuryBase]
  if (centuryCode === undefined) return null

  const y = year % 100
  const yDiv4 = Math.floor(y / 4)
  const yearCode = (y + yDiv4) % 7
  const leap = isLeapYear(year)
  const leapAdjust = leap && (month === 1 || month === 2) ? -1 : 0
  const monthCode = MONTH_CODES[month]
  const adjustedMonthCode = monthCode + leapAdjust

  const reducedCentury = ((centuryCode % 7) + 7) % 7
  const reducedYear = ((y % 7) + 7) % 7
  const reducedYearDiv4 = ((yDiv4 % 7) + 7) % 7
  const reducedMonth = ((adjustedMonthCode % 7) + 7) % 7
  const reducedDay = ((day % 7) + 7) % 7
  const sum = reducedCentury + reducedYear + reducedYearDiv4 + reducedMonth + reducedDay
  const weekdayIndex = sum % 7

  return {
    input: formatDate(year, month, day),
    year,
    month,
    day,
    steps: [
      { name: 'century', label: '世紀コード', value: centuryCode, explain: `${centuryBase}年代 → ${centuryCode}` },
      { name: 'year', label: '年下2桁', value: y, explain: `${year} の下2桁 → ${y}` },
      { name: 'yearDiv4', label: 'floor(y/4)', value: yDiv4, explain: `floor(${y}/4) = ${yDiv4}` },
      { name: 'yearCode', label: '年コード', value: yearCode, explain: `(${y} + ${yDiv4}) mod 7 = ${yearCode}` },
      {
        name: 'month',
        label: '月コード',
        value: adjustedMonthCode,
        explain: leapAdjust === 0 ? `${month}月 → ${monthCode}` : `${month}月 → ${monthCode} に閏年補正 -1`,
      },
      { name: 'day', label: '日', value: day, explain: `${day}` },
      {
        name: 'sum',
        label: '合計',
        value: sum,
        explain: `${reducedCentury} + ${reducedYear} + ${reducedYearDiv4} + ${reducedMonth} + ${reducedDay} = ${sum}`,
      },
      { name: 'mod7', label: 'mod 7', value: weekdayIndex, explain: `${sum} mod 7 = ${weekdayIndex}` },
    ],
    weekdayIndex,
    weekdayName: WEEKDAY_NAMES[weekdayIndex],
    weekdayJa: WEEKDAY_NAMES_JA[weekdayIndex],
    isLeapYear: leap,
    leapAdjust,
    yearCode,
  }
}

export function randomWeekdayQuestion(random = Math.random): WeekdayQuestion {
  while (true) {
    const year = 1500 + Math.floor(random() * 1001)
    const month = 1 + Math.floor(random() * 12)
    const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const day = 1 + Math.floor(random() * maxDay)
    const date = formatDate(year, month, day)
    const result = calculateWeekday(date)
    if (result) {
      return {
        id: `${date}-${Math.floor(random() * 1_000_000)}`,
        date,
        result,
      }
    }
  }
}

export function createWeekdayQuiz(count = 10, random = Math.random): WeekdayQuestion[] {
  const used = new Set<string>()
  const questions: WeekdayQuestion[] = []
  while (questions.length < count) {
    const q = randomWeekdayQuestion(random)
    if (used.has(q.date)) continue
    used.add(q.date)
    questions.push(q)
  }
  return questions
}

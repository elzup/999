// アプリ (TypeScript) から src/images/entry-images.js を読むための型
export function withEntryImage<T extends object>(
  entry: T,
  slot: string,
  url: string
): T
export function withSlotImages<
  T extends { numbers?: object[]; dates?: object[]; cards?: object[] },
>(data: T, docs: Record<string, { image?: { url?: string } }>): T

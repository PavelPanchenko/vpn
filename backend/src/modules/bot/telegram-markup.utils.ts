let cachedMarkup: unknown | null = null;

/** DRY: единая точка получения Markup (telegraf) с кэшем. */
export async function getMarkup(): Promise<any> {
  if (cachedMarkup) return cachedMarkup;
  const { Markup } = await import('telegraf');
  cachedMarkup = Markup;
  return cachedMarkup;
}

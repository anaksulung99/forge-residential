interface QueryOptions {
  search: string;
  limit: number;
  offset: number;
}
export class SimplelocalizeUtils {
  async query(options: QueryOptions): Promise<SimplelocalizeCountryItem[]> {
    const response = await fetch(
      `https://cdn.simplelocalize.io/public/v1/locales`,
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch locales: ${response.statusText}`);
    }

    const data = (await response.json()) as SimplelocalizeCountryItem[];
    if (!Array.isArray(data)) {
      return [];
    }

    let results: SimplelocalizeCountryItem[] = [];
    if (options.search) {
      results = data.filter((item) => {
        return (
          item.country.name.includes(options.search) ||
          item.country.code.includes(options.search) ||
          item.country.name_local.includes(options.search)
        );
      });
    } else {
      results = data;
    }

    const offset = options.offset || 0;
    const limit = options.limit || results.length;
    return results.slice(offset, offset + limit);
  }

  async getDetailByLocale(
    locale: string,
  ): Promise<SimplelocalizeCountryItem | null> {
    const results = await this.query({ search: locale, limit: 1, offset: 0 });
    return results.find((item) => item.locale === locale) || null;
  }
}

export const simplelocalizeUtils = new SimplelocalizeUtils();

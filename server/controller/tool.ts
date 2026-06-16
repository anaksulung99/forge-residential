import type { H3Event } from "h3";
import type { Prisma } from "@prisma/client";
import { ProxyScraperToolService } from "~~/server/services/scraper-tool-service";

export const scrapeHandler = async (event: H3Event) => {
  try {
    const session = await getSessionFromContext(event);
    const currentUser = session.user;
    if (!currentUser) {
      throw createError({
        statusCode: 401,
        statusMessage: "User not logged in",
        data: { code: "USER_NOT_LOGGED_IN", message: "User not logged in" },
      });
    }

    const body = toolsScrapeSchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: "Invalid data",
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const scraper = new ProxyScraperToolService(body.data);

    const result = await scraper.scrape();

    let filtered = result;

    if (body.data.country) {
      filtered = filtered.filter((p) => p.country === body.data.country);
    }

    return {
      success: true,
      message: `Scraping ${body.data.sources} done.`,
      data: filtered,
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

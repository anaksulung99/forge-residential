import type { H3Event } from "h3";
import { ProxyScraperToolService } from "~~/server/services/scraper-tool-service";
import { ProxyTesterService } from "~~/server/services/playwright-tester-service";

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
    if (body.data.protocol) {
      filtered = filtered.filter((p) => p.protocol === body.data.protocol);
    }
    if (body.data.anonymity) {
      filtered = filtered.filter((p) => p.anonymity === body.data.anonymity);
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

export const testPoolHandler = async (event: H3Event) => {
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

    const body = testProxySchema.safeParse(await readBody(event));
    if (!body.success) {
      throw createError({
        statusCode: 422,
        statusMessage: body.error.issues.map((i) => i.message).join(", "),
        data: {
          code: "VALIDATION_ERROR",
          message: body.error.issues.map((i) => i.message).join(", "),
        },
      });
    }

    const tester = new ProxyTesterService(body.data, currentUser.id);
    const result =
      body.data.type === "Request"
        ? await tester.processRequest()
        : await tester.processSession();

    if (result instanceof Error) {
      throw createError({
        statusCode: 500,
        statusMessage: result.message || "Internal server error",
        data: { code: "TEST_ERROR", message: result.message },
      });
    }

    return {
      success: true,
      message: `Testing ${body.data.targetUrl} done.`,
      data: result,
    };
  } catch (error) {
    throw handleRequestError(error);
  }
};

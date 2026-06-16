import * as z from "zod";

const querySchema = z.object({
  search: z.string().default(""),
  limit: z.coerce.number().min(1).max(500).default(200),
  offset: z.coerce.number().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  const raw = getQuery(event);
  const query = querySchema.parse(raw);

  const items = await simplelocalizeUtils.query({
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  });

  return items;
});

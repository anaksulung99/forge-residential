import * as z from "zod";

interface TimezoneItem {
  id: string;
  name: string;
  abbreviation: string;
  utc_offset: string;
  dst_offset: string | null;
  region: string;
}

const querySchema = z.object({
  search: z.string().default(""),
  limit: z.coerce.number().min(1).max(500).default(500),
  offset: z.coerce.number().min(0).default(0),
});

export default defineEventHandler(async (event) => {
  // ── Build timezone list from Intl API ─────────────────────────────────
  // Generate all IANA timezones with rich metadata
  const now = new Date();

  const allTimezones: TimezoneItem[] = Intl.supportedValuesOf("timeZone").map(
    (tzId) => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tzId,
        timeZoneName: "short",
      });

      // Get the offset string like "+07:00" or "-05:00"
      const parts = formatter.formatToParts(now);
      const offsetPart = parts.find((p) => p.type === "timeZoneName");
      const offsetStr = offsetPart?.value || tzId;

      // Determine region from timezone string
      let region = "Other";
      if (/^(Africa|Europe|America|Antarctica|Arctic)/.test(tzId)) {
        region = tzId.split("/")[0] || "Other";
      } else if (/^Asia/.test(tzId)) {
        region = "Asia";
      } else if (/^Pacific/.test(tzId)) {
        region = "Pacific";
      } else if (/^Atlantic|Indian/.test(tzId)) {
        region = tzId.split("/")[0] || "Other";
      } else if (
        tzId === "UTC" ||
        tzId === "GMT" ||
        tzId === "Etc/UTC" ||
        tzId === "Etc/GMT"
      ) {
        region = "Global";
      }

      // Clean name: replace underscores, slashes
      const rawName = tzId.split("/").pop() || tzId;
      const name = rawName.replace(/_/g, " ");

      return {
        id: tzId,
        name,
        abbreviation: offsetStr,
        utc_offset: offsetStr,
        dst_offset: null,
        region,
      };
    },
  );

  const raw = getQuery(event);
  const query = querySchema.parse(raw);

  let results: TimezoneItem[];

  if (query.search) {
    const q = query.search.toLowerCase();
    results = allTimezones.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.abbreviation.toLowerCase().includes(q) ||
        item.region.toLowerCase().includes(q),
    );
  } else {
    results = allTimezones;
  }

  const total = results.length;
  const paginated = results.slice(query.offset, query.offset + query.limit);

  return paginated;
});

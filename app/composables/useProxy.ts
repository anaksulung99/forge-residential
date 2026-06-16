import { useDebounceFn } from "@vueuse/core";

// =====================================================================
// useProxy — state + CRUD + polling + realtime untuk halaman Proxies
// =====================================================================

export interface ProxyRow {
  id: string;
  host: string;
  port: number;
  protocol: "http" | "https" | "socks5";
  category: "RESIDENTIAL_ROTATING" | "MOBILE_ROTATING";
  isMobile: boolean;
  country: string | null;
  asnOrg: string | null;
  status: "pending" | "checking" | "active" | "dead" | "banned";
  latencyMs: number | null;
  uptimeScore: number;
  createdAt: string;
}
export interface Stats {
  totalProxy: number;
  activeTotal: number;
  checkingTotal: number;
  pendingTotal: number;
  bannedTotal: number;
  deadTotal: number;
}
interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  has_more: boolean;
}
export interface FecthProxyOption {
  search?: string;
  status?: "all" | "pending" | "checking" | "active" | "dead" | "banned";
  category?: "all" | "RESIDENTIAL_ROTATING" | "MOBILE_ROTATING";
  protocol?: "all" | "http" | "https" | "socks5";
  country?: string | "all";
}
interface ImportProxyDto {
  raw: string;
  defaultProtocol: "http" | "https" | "socks5";
  sourceLabel: string | undefined;
}
export interface ImportResult {
  found: number;
  imported: number;
  batchDuplicates: number;
  dbDuplicates: number;
  invalid: { raw: string; reason: string }[];
}
interface ScrapeForm {
  sources: string[];
  country?: string | "all";
  protocol?: string | "all";
  anonymity?: string | "all";
}
export interface ScrapeJob {
  id: string;
  source: string;
  status: string;
  found: number;
  imported: number;
  error: string | null;
  createdAt: string;
}

export default function useProxy() {
  const toast = useAppToast();

  // ── State ───────────────────────────────────────────
  const filters = ref<FecthProxyOption>({
    search: "",
    status: "all",
    category: "all",
    protocol: "all",
    country: "",
  });
  const rows = ref<ProxyRow[]>([]);
  const stats = ref<Stats>({
    totalProxy: 0,
    activeTotal: 0,
    checkingTotal: 0,
    pendingTotal: 0,
    bannedTotal: 0,
    deadTotal: 0,
  });
  const meta = ref<ListMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    has_more: false,
  });

  const importResult = ref<ImportResult | null>(null);
  const scrapeJobs = ref<ScrapeJob[]>([]);

  const page = ref(1);
  const limit = ref(20);
  const loading = ref(false);

  const selected = ref<Set<string>>(new Set());
  const busyId = ref<string | null>(null);

  // ── Fetch ───────────────────────────────────────────
  async function fetchProxies() {
    loading.value = true;
    try {
      const res = await $fetch<{
        data: { rows: ProxyRow[]; stats: Stats };
        meta: ListMeta;
      }>("/api/proxies", {
        query: {
          page: page.value,
          limit: limit.value,
          ...(filters.value.search && { search: filters.value.search }),
          ...(filters.value.status !== "all" && {
            status: filters.value.status,
          }),
          ...(filters.value.category !== "all" && {
            category: filters.value.category,
          }),
          ...(filters.value.protocol !== "all" && {
            protocol: filters.value.protocol,
          }),
          ...(filters.value.country && {
            country: filters.value.country,
          }),
        },
      });
      rows.value = res.data.rows;
      stats.value = res.data.stats;
      meta.value = res.meta;
    } catch (err: any) {
      toast.error(err?.data?.message || "Gagal memuat proxy.");
    } finally {
      loading.value = false;
    }
  }

  // ── Polling (auto-stop saat tak ada status 'checking') ─
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(maxAttempts = 20, intervalMs = 3000) {
    stopPolling();
    let attempts = 0;
    const tick = async () => {
      attempts++;
      await fetchProxies();
      const stillChecking = rows.value.some((r) => r.status === "checking");
      if (stillChecking && attempts < maxAttempts) {
        pollTimer = setTimeout(tick, intervalMs);
      } else {
        pollTimer = null;
      }
    };
    pollTimer = setTimeout(tick, intervalMs);
  }

  // ── Realtime (WS queue:update → refresh halus) ────────
  const { queueEvents } = useRealtime();
  const realtimeRefetch = useDebounceFn(fetchProxies, 600);
  watch(
    () => queueEvents.value.length,
    (len, old) => {
      if (len === old) return;
      const latest = queueEvents.value[0];
      if (
        latest &&
        (latest.queue === "proxy-check" || latest.queue === "proxy-scrape")
      ) {
        realtimeRefetch();
      }
    },
  );

  // ── Filter watchers + init ──────────────────────────
  const hasFilter = computed(
    () =>
      !!filters.value.search ||
      filters.value.status !== "all" ||
      filters.value.category !== "all" ||
      filters.value.protocol !== "all" ||
      !!filters.value.country,
  );

  async function resetFilter() {
    filters.value = {
      search: "",
      status: "all",
      category: "all",
      protocol: "all",
      country: "",
    };
    page.value = 1;
    limit.value = 20;
    await fetchProxies();
  }

  const debouncedSearch = useDebounceFn(() => {
    page.value = 1;
    limit.value = 20;
    fetchProxies();
  }, 400);

  watch(() => filters.value.search, debouncedSearch);
  watch(
    [
      () => filters.value.status,
      () => filters.value.category,
      () => filters.value.protocol,
      () => filters.value.country,
    ],
    () => {
      page.value = 1;
      limit.value = 20;
      fetchProxies();
    },
  );
  watch(page, () => fetchProxies());
  watch(limit, () => fetchProxies());

  // ── Selection ───────────────────────────────────────
  const allSelected = computed(
    () =>
      rows.value.length > 0 &&
      rows.value.every((r) => selected.value.has(r.id)),
  );
  function toggleSelect(id: string) {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
  }
  function toggleAll() {
    selected.value = allSelected.value
      ? new Set()
      : new Set(rows.value.map((r) => r.id));
  }
  watch(rows, () => {
    selected.value = new Set();
  });

  // ── CRUD / aksi ─────────────────────────────────────
  async function importProxy(data: ImportProxyDto) {
    loading.value = true;
    try {
      const res = await $fetch<{ message: string; data: ImportResult }>(
        "/api/proxies/import",
        { method: "POST", body: data },
      );
      importResult.value = res.data;
      toast.success(res.message);
      page.value = 1;
      limit.value = 20;
      await fetchProxies();
      startPolling();
    } catch (err: any) {
      toast.error(err?.data?.message || "Import gagal.");
    } finally {
      loading.value = false;
    }
  }

  async function scraper(data: ScrapeForm) {
    loading.value = true;
    try {
      const res = await $fetch<{ message: string }>("/api/proxies/scrape", {
        method: "POST",
        body: {
          sources: data.sources,
          country: data.country !== "all" ? data.country : undefined,
          protocol: data.protocol !== "all" ? data.protocol : undefined,
          anonymity: data.anonymity !== "all" ? data.anonymity : undefined,
        },
      });
      toast.success(res.message);
      startPolling();
    } catch (err: any) {
      toast.error(err?.data?.message || "Gagal memulai scraping.");
    } finally {
      loading.value = false;
    }
  }

  async function scrapeProxyJobs() {
    try {
      const res = await $fetch<{ data: ScrapeJob[] }>("/api/proxies/scrape");
      scrapeJobs.value = res.data;
      return res.data.some(
        (j) => j.status === "queued" || j.status === "running",
      );
    } catch {
      return false;
    }
  }

  async function checkProxy(
    scope: "pending" | "all" | "selected",
    ids?: string[],
  ) {
    loading.value = true;
    try {
      const res = await $fetch<{ message: string }>("/api/proxies/check", {
        method: "POST",
        body: { scope, ids, method: "fast" },
      });
      toast.success(res.message);
      await fetchProxies();
      startPolling();
    } catch (err: any) {
      toast.error(err?.data?.message || "Gagal mengantre pengecekan.");
    } finally {
      loading.value = false;
    }
  }

  function checkPending() {
    checkProxy("pending");
  }
  function checkSelected() {
    const ids = [...selected.value];
    if (ids.length) checkProxy("selected", ids);
  }

  async function recheckOne(id: string) {
    busyId.value = id;
    try {
      const res = await $fetch<{ message: string }>(
        `/api/proxies/${id}/recheck`,
        { method: "POST" },
      );
      toast.success(res.message);
      await fetchProxies();
    } catch (err: any) {
      toast.error(err?.data?.message || "Re-check gagal.");
    } finally {
      busyId.value = null;
    }
  }

  async function deleteOne(id: string) {
    if (!confirm("Hapus proxy ini?")) return;
    busyId.value = id;
    try {
      await $fetch(`/api/proxies/${id}`, { method: "DELETE" });
      toast.success("Proxy dihapus.");
      await fetchProxies();
    } catch (err: any) {
      toast.error(err?.data?.message || "Hapus gagal.");
    } finally {
      busyId.value = null;
    }
  }

  async function bulkDelete() {
    const ids = [...selected.value];
    if (ids.length === 0) return;
    if (!confirm(`Hapus ${ids.length} proxy terpilih?`)) return;
    loading.value = true;
    try {
      const res = await $fetch<{ message: string }>("/api/proxies/bulk", {
        method: "DELETE",
        body: { ids },
      });
      toast.success(res.message);
      await fetchProxies();
    } catch (err: any) {
      toast.error(err?.data?.message || "Bulk delete gagal.");
    } finally {
      loading.value = false;
    }
  }

  async function cleanUpProxies() {
    loading.value = true;
    try {
      const res = await $fetch(`/api/proxies/clean-up`, {
        method: "POST",
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to clean up logs");
      }
      toast.success("Logs cleaned up successfully");

      await fetchProxies();

      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fail to clean up logs");
      return false;
    } finally {
      loading.value = false;
    }
  }

  // ── Lifecycle ───────────────────────────────────────
  onMounted(fetchProxies);
  onUnmounted(stopPolling);

  return {
    // state
    filters,
    rows,
    stats,
    meta,
    page,
    limit,
    loading,
    selected,
    busyId,
    importResult,
    scrapeJobs,
    // derived
    hasFilter,
    allSelected,
    // actions
    fetchProxies,
    resetFilter,
    toggleSelect,
    toggleAll,
    importProxy,
    scraper,
    scrapeProxyJobs,
    checkProxy,
    checkPending,
    checkSelected,
    recheckOne,
    deleteOne,
    bulkDelete,
    startPolling,
    stopPolling,
    cleanUpProxies,
  };
}

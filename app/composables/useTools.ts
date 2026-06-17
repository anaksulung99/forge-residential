export const useTools = () => {
  const toast = useAppToast();

  const proxies = ref<ScrapedProxy[]>([]);
  const proxyCheckMeta = ref({
    total: 0,
    valid: 0,
    error: 0,
    notSupported: 0,
    proxyTypeStats: {
      residential: 0,
      mobile: 0,
      isp: 0,
      datacenter: 0,
      unknown: 0,
    },
  });
  const isCheckingProxies = ref(false);
  const proxyTestResult = ref<unknown>(null);

  const isLoading = ref(false);

  const scrape = async (opts: ToolsScrapeInput) => {
    isLoading.value = true;
    try {
      const res = await $fetch("/api/tools/scrape", {
        method: "POST",
        body: opts,
      });
      if (!res.success) throw new Error(res.message || "Scrape failed");
      proxies.value = res.data || [];
      toast.success("Scrape completed");
      return res.data || [];
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scrape failed");
    } finally {
      isLoading.value = false;
    }
  };

  const testPool = async (opts: TestProxyInput) => {
    isLoading.value = true;
    try {
      const res = await $fetch("/api/tools/test", {
        method: "POST",
        body: opts,
      });
      if (!res.success) throw new Error(res.message || "Tested failed");

      proxyTestResult.value = res.data ?? null;
      toast.success("Tested completed");
      return res.data ?? true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tested failed");
      return false;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    proxies,
    proxyCheckMeta,
    proxyTestResult,
    isCheckingProxies,
    isLoading,
    scrape,
    testPool,
  };
};

<script setup lang="ts">
definePageMeta({
  layout: "auth",
  middleware: "auth",
});
useSeoMeta({
  title: "Dashboard",
  description:
    "Welcome to your dashboard. Here you can manage your account and view your activity.",
  robots: "noindex, nofollow",
});

const { user } = useUserSession();

const toast = useAppToast();

interface Overview {
  summary: {
    totalProxies: number;
    active: number;
    dead: number;
    pending: number;
    checking: number;
    banned: number;
    mobile: number;
    residential: number;
    totalPools: number;
    activePools: number;
  };
  traffic: {
    totalRequests: number;
    bytesIn: number;
    bytesOut: number;
    gb: number;
  };
  series: { date: string; requests: number; mb: number }[];
  statusDistribution: { label: string; value: number }[];
  categoryDistribution: { label: string; value: number }[];
  topCountries: { country: string; count: number }[];
  topPools: { name: string; requests: number; mb: number }[];
}

interface Quota {
  usedGb: number;
  quotaGb: number | null;
  usedRequests: number;
  quotaRequests: number | null;
  unlimitedBandwidth: boolean;
  unlimitedRequests: boolean;
}

const data = ref<Overview | null>(null);
const quota = ref<Quota | null>(null);
const loading = ref(false);

async function fetchOverview() {
  loading.value = true;
  try {
    const res = await $fetch<{ data: Overview }>("/api/analytics/overview");
    data.value = res.data;
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal memuat analytics.");
  } finally {
    loading.value = false;
  }
}

async function fetchQuota() {
  try {
    const res = await $fetch<{ data: Quota }>("/api/user/quota");
    quota.value = res.data;
  } catch {
    /* abaikan */
  }
}

function pct(used: number, limit: number | null) {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
function pctColor(p: number) {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

onMounted(() => {
  fetchOverview();
  fetchQuota();
});

const series = computed(() => data.value?.series ?? []);
const xFormatter = (i: number) => series.value[i]?.date ?? "";

const bandwidthCat = { mb: { name: "MB", color: "#10b981" } };
const requestsCat = { requests: { name: "Requests", color: "#6366f1" } };

const statCards = computed(() => {
  const s = data.value?.summary;
  const t = data.value?.traffic;
  return [
    {
      label: "Total Proxy",
      value: s?.totalProxies ?? 0,
      icon: "i-heroicons-bolt",
      color: "indigo",
    },
    {
      label: "Active",
      value: s?.active ?? 0,
      icon: "i-heroicons-check-circle",
      color: "emerald",
    },
    {
      label: "Mobile",
      value: s?.mobile ?? 0,
      icon: "material-symbols:smartphone",
      color: "emerald",
    },
    {
      label: "Residential",
      value: s?.residential ?? 0,
      icon: "material-symbols:home-outline",
      color: "sky",
    },
    {
      label: "Total Requests",
      value: t?.totalRequests ?? 0,
      icon: "material-symbols:swap-horiz",
      color: "indigo",
    },
    {
      label: "Bandwidth",
      value: t?.gb ?? 0,
      unit: "GB",
      icon: "material-symbols:database-outline",
      color: "amber",
    },
  ];
});

function barWidth(value: number, list: { value?: number; count?: number }[]) {
  const max = Math.max(1, ...list.map((x) => x.value ?? x.count ?? 0));
  return `${Math.round((value / max) * 100)}%`;
}

const statusColors: Record<string, string> = {
  Active: "bg-emerald-500",
  Dead: "bg-red-500",
  Pending: "bg-neutral-500",
  Checking: "bg-sky-500",
  Banned: "bg-amber-500",
};
</script>

<template>
  <AppDashboardLayout id="dashboard" title="Dashboard">
    <template #content>
      <div class="min-h-screen p-6">
        <div class="mx-auto max-w-7xl space-y-6">
          <div
            class="flex flex-col md:flex-row items-center justify-center md:justify-between"
          >
            <div>
              <h1 class="text-2xl font-bold tracking-tight">
                Welcome,
                <span class="font-medium text-primary">
                  {{ user?.name ?? "Sob" }}
                </span>
                👋
              </h1>
              <p class="text-sm text-muted">
                Statistik proxy & trafik gateway (14 hari terakhir).
              </p>
            </div>
            <div class="flex items-center gap-1">
              <UButton
                icon="material-symbols:refresh"
                color="neutral"
                variant="outline"
                size="md"
                :loading="loading"
                :disabled="loading"
                @click="fetchOverview"
              >
                <span class="hidden md:block">Refresh</span>
              </UButton>
              <UButton
                to="/app/proxies"
                icon="material-symbols-light:vpn-lock-rounded"
                color="secondary"
                size="md"
                :disabled="loading"
                class="text-white"
              >
                <span class="hidden md:block">Add Proxy</span>
              </UButton>
              <UButton
                to="/app/pools"
                icon="material-symbols:hub-outline"
                color="primary"
                size="md"
                :disabled="loading"
                class="text-white"
              >
                <span class="hidden md:block">Add Pool</span>
              </UButton>
            </div>
          </div>

          <!-- KPI cards -->
          <div class="grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatsCard
              v-for="stat in statCards"
              :key="stat.label"
              :label="stat.label"
              :value="stat.value"
              :unit="stat.unit"
              :icon="stat.icon"
              :color="stat.color as ColorVariant"
              format="compact"
              :loading="loading"
            />
          </div>

          <!-- Quota -->
          <div
            v-if="quota"
            class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-medium">Kuota Pemakaian</h3>
              <span class="text-xs text-muted">
                Butuh tambah kuota? Hubungi admin.
              </span>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <!-- Bandwidth -->
              <div>
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-muted">Bandwidth</span>
                  <span class="font-medium">
                    {{ quota.usedGb }} GB /
                    {{ quota.unlimitedBandwidth ? "∞" : `${quota.quotaGb} GB` }}
                  </span>
                </div>
                <div
                  class="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                >
                  <div
                    class="h-full rounded-full"
                    :class="
                      quota.unlimitedBandwidth
                        ? 'bg-emerald-500'
                        : pctColor(pct(quota.usedGb, quota.quotaGb))
                    "
                    :style="{
                      width: quota.unlimitedBandwidth
                        ? '100%'
                        : `${pct(quota.usedGb, quota.quotaGb)}%`,
                    }"
                  />
                </div>
              </div>
              <!-- Requests -->
              <div>
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-muted">Requests</span>
                  <span class="font-medium">
                    {{ quota.usedRequests.toLocaleString() }} /
                    {{
                      quota.unlimitedRequests
                        ? "∞"
                        : quota.quotaRequests?.toLocaleString()
                    }}
                  </span>
                </div>
                <div
                  class="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                >
                  <div
                    class="h-full rounded-full"
                    :class="
                      quota.unlimitedRequests
                        ? 'bg-emerald-500'
                        : pctColor(pct(quota.usedRequests, quota.quotaRequests))
                    "
                    :style="{
                      width: quota.unlimitedRequests
                        ? '100%'
                        : `${pct(quota.usedRequests, quota.quotaRequests)}%`,
                    }"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Charts -->
          <UPageCard
            spotlight
            spotlight-color="secondary"
            :ui="{
              root: 'overflow-auto shadow-md w-full',
              container:
                'shadow-md border border-secondary/20 dark:border-secondary/35 rounded-xl transition-all group overflow-auto  w-full',
            }"
          >
            <div class="grid gap-4 lg:grid-cols-2">
              <div
                class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <h3 class="mb-3 text-sm font-medium">Bandwidth (MB)</h3>
                <AreaChart
                  v-if="series.length"
                  :data="series"
                  :categories="bandwidthCat"
                  :height="260"
                  :x-formatter="xFormatter"
                  class="w-full max-w-md"
                />
              </div>
              <div
                class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
              >
                <h3 class="mb-3 text-sm font-medium">Requests</h3>
                <BarChart
                  v-if="series.length"
                  :data="series"
                  :categories="requestsCat"
                  :y-axis="['requests']"
                  :height="260"
                  :x-formatter="xFormatter"
                  class="w-full max-w-md"
                />
              </div>
            </div>
          </UPageCard>

          <!-- Distributions + tops -->
          <div class="grid gap-4 lg:grid-cols-3">
            <!-- Status -->
            <div
              class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <h3 class="mb-3 text-sm font-medium">Distribusi Status</h3>
              <div class="space-y-2">
                <div
                  v-for="s in data?.statusDistribution ?? []"
                  :key="s.label"
                  class="text-xs"
                >
                  <div class="mb-1 flex justify-between">
                    <span class="text-muted">{{ s.label }}</span>
                    <span class="font-medium">{{ s.value }}</span>
                  </div>
                  <div
                    class="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                  >
                    <div
                      class="h-full rounded-full"
                      :class="statusColors[s.label]"
                      :style="{
                        width: barWidth(
                          s.value,
                          data?.statusDistribution ?? [],
                        ),
                      }"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Category + Top countries -->
            <div
              class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <h3 class="mb-3 text-sm font-medium">Kategori & Negara</h3>
              <div class="mb-4 flex gap-3">
                <div
                  v-for="c in data?.categoryDistribution ?? []"
                  :key="c.label"
                  class="flex-1 rounded-lg border border-neutral-200 p-3 text-center dark:border-neutral-800"
                >
                  <p class="text-lg font-semibold">{{ c.value }}</p>
                  <p class="text-xs text-muted">{{ c.label }}</p>
                </div>
              </div>
              <div class="space-y-1.5">
                <div
                  v-for="c in data?.topCountries ?? []"
                  :key="c.country"
                  class="flex items-center gap-2 text-xs"
                >
                  <span class="w-8 font-mono">{{ c.country }}</span>
                  <div
                    class="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
                  >
                    <div
                      class="h-full rounded-full bg-indigo-500"
                      :style="{
                        width: barWidth(c.count, data?.topCountries ?? []),
                      }"
                    />
                  </div>
                  <span class="w-8 text-right font-medium">{{ c.count }}</span>
                </div>
              </div>
            </div>

            <!-- Top pools -->
            <div
              class="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
            >
              <h3 class="mb-3 text-sm font-medium">Top Pools (trafik)</h3>
              <div
                v-if="(data?.topPools ?? []).length"
                class="divide-y divide-neutral-100 text-sm dark:divide-neutral-800"
              >
                <div
                  v-for="p in data?.topPools ?? []"
                  :key="p.name"
                  class="flex items-center justify-between py-2"
                >
                  <span class="truncate">{{ p.name }}</span>
                  <span class="shrink-0 text-xs text-muted">
                    {{ p.requests }} req · {{ p.mb }} MB
                  </span>
                </div>
              </div>
              <p v-else class="py-6 text-center text-xs text-muted">
                Belum ada trafik gateway.
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AppDashboardLayout>
</template>

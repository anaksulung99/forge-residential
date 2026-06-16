<script setup lang="ts">
import type { ProxyRow } from "~/composables/useProxy";

definePageMeta({
  layout: "auth",
  middleware: "auth",
});
useSeoMeta({
  title: "Proxies",
  description: "Manage your proxies here.",
  robots: "noindex, nofollow",
});

const {
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
  hasFilter,
  allSelected,
  fetchProxies,
  resetFilter,
  toggleSelect,
  toggleAll,
  importProxy,
  scraper,
  scrapeProxyJobs,
  checkPending,
  checkSelected,
  recheckOne,
  deleteOne,
  bulkDelete,
  cleanUpProxies,
} = useProxy();
const toast = useAppToast();
const { warning } = useGlobalAlert();

const countrySelect = ref({ label: "Semua", value: "all" });
const filterCountry = ref({ label: "", value: "" });
// ── Import modal ──────────────────────────────────────
const importOpen = ref(false);
const importForm = reactive({
  raw: "",
  defaultProtocol: "http" as "http" | "https" | "socks5",
  sourceLabel: "",
});

function openImport() {
  importForm.raw = "";
  importForm.sourceLabel = "";
  importForm.defaultProtocol = "http";
  importResult.value = null;
  importOpen.value = true;
}

async function submitImport() {
  if (importForm.raw.trim().length < 3) {
    toast.warning("Tempel dulu daftar proxy-nya.");
    return;
  }
  await importProxy({
    raw: importForm.raw,
    defaultProtocol: importForm.defaultProtocol,
    sourceLabel: importForm.sourceLabel || undefined,
  });
  importOpen.value = false;
}

// ── Upload file ke textarea ───────────────────────────
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    importForm.raw = importForm.raw
      ? `${importForm.raw.trimEnd()}\n${text}`
      : text;
  };
  reader.onerror = () => toast.error("Gagal membaca file.");
  reader.readAsText(file);
  input.value = ""; // reset agar file sama bisa dipilih lagi
}

// ── Scraper ───────────────────────────────────────────
const SCRAPE_SOURCES = [
  { value: "free-proxy-list", label: "free-proxy-list.net" },
  { value: "sslproxies", label: "sslproxies.org" },
  { value: "us-proxy", label: "us-proxy.org" },
  { value: "spys-one", label: "spys.one" },
  { value: "proxyscrape", label: "proxyscrape.com" },
  { value: "proxy-daily", label: "proxy-daily.com" },
  { value: "sunny-proxy", label: "sunny9577.github.io" },
];

const scrapeOpen = ref(false);

const scrapeForm = reactive({
  sources: ["free-proxy-list"] as string[],
  country: "all",
  protocol: "all",
  anonymity: "all",
});
let scrapePollTimer: ReturnType<typeof setTimeout> | null = null;

function toggleSource(v: string) {
  const i = scrapeForm.sources.indexOf(v);
  if (i === -1) scrapeForm.sources.push(v);
  else scrapeForm.sources.splice(i, 1);
}

function openScrape() {
  scrapeForm.sources = ["free-proxy-list"];
  scrapeForm.country = "all";
  scrapeForm.protocol = "all";
  scrapeForm.anonymity = "all";
  scrapeOpen.value = true;
  fetchScrapeJobs();
}

async function fetchScrapeJobs() {
  try {
    const active = await scrapeProxyJobs();
    if (active && scrapeOpen.value) {
      scrapePollTimer = setTimeout(fetchScrapeJobs, 2500);
    } else if (scrapePollTimer) {
      clearTimeout(scrapePollTimer);
      scrapePollTimer = null;
      await fetchProxies();
    }
  } catch {
    /* abaikan */
  }
}

async function submitScrape() {
  if (scrapeForm.sources.length === 0) {
    toast.warning("Pilih minimal 1 sumber.");
    return;
  }

  await scraper(scrapeForm);
  await fetchScrapeJobs();
  scrapeOpen.value = false;
}

onUnmounted(() => {
  if (scrapePollTimer) clearTimeout(scrapePollTimer);
});

// ── Helpers tampilan ──────────────────────────────────
const statusColor: Record<ProxyRow["status"], string> = {
  pending: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
  checking: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  dead: "bg-red-500/15 text-red-400 border-red-500/30",
  banned: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

function categoryLabel(row: ProxyRow) {
  return row.category === "MOBILE_ROTATING" ? "Mobile" : "Residential";
}

const statCards = computed(() => {
  return [
    {
      label: "Total Proxy",
      value: stats.value.totalProxy,
      color: "indigo",
      border: "border-white/[0.08]",
      icon: "i-heroicons-bolt",
    },
    {
      label: "Active",
      value: stats.value.activeTotal,
      color: "emerald",
      border: "border-emerald-500/15",
      icon: "i-heroicons-check-circle",
    },
    {
      label: "Checking",
      value: stats.value.checkingTotal,
      color: "amber",
      border: "border-amber-500/15",
      icon: "mdi:clock-check-outline",
    },
    {
      label: "Pending",
      value: stats.value.pendingTotal,
      color: "neutral",
      border: "border-neutral-500/15",
      icon: "material-symbols:hourglass-top",
    },
    {
      label: "Banned",
      value: stats.value.bannedTotal,
      color: "red",
      border: "border-red-500/15",
      icon: "ic:baseline-block",
    },
    {
      label: "Dead",
      value: stats.value.deadTotal,
      color: "red",
      border: "border-red-500/15",
      icon: "material-symbols:delete-forever",
    },
  ];
});
</script>

<template>
  <AppDashboardLayout id="proxies" title="Proxies">
    <template #content>
      <div class="min-h-screen p-4 md:p-6">
        <div class="mx-auto max-w-7xl space-y-5">
          <!-- Header -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold">Proxies</h1>
              <p class="text-sm text-muted">{{ meta.total }} proxy total</p>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="hasFilter"
                icon="ic:sharp-clear"
                color="error"
                size="md"
                class="text-white"
                @click="resetFilter"
              >
                <span class="hidden md:block">Reset Filter</span>
              </UButton>
              <UButton
                icon="material-symbols:refresh"
                color="neutral"
                variant="outline"
                size="md"
                :loading="loading"
                @click="fetchProxies"
              >
                <span class="hidden md:block">Refresh</span>
              </UButton>
              <UButton
                icon="ic:round-cleaning-services"
                color="warning"
                size="md"
                class="text-white"
                :loading="loading"
                @click="
                  () => {
                    warning(
                      'Warning!',
                      'Are you sure to clean up dead proxies?',
                    ).then((confirm) => {
                      if (confirm) {
                        cleanUpProxies();
                      }
                    });
                  }
                "
              >
                <span class="hidden md:block">Clean Up</span>
              </UButton>
              <UButton
                icon="i-heroicons-bolt"
                color="info"
                size="md"
                class="text-white"
                :loading="loading"
                @click="checkPending"
              >
                <span class="hidden md:block">Check Pending</span>
              </UButton>
              <UButton
                icon="i-heroicons-globe-alt"
                color="success"
                size="md"
                class="text-white"
                @click="openScrape"
              >
                <span class="hidden md:block">Scrape</span>
              </UButton>
              <UButton
                icon="i-heroicons-arrow-up-tray"
                color="primary"
                size="md"
                class="text-white"
                @click="openImport"
              >
                <span class="hidden md:block">Import Proxy</span>
              </UButton>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatsCard
              v-for="stat in statCards"
              :key="stat.label"
              :label="stat.label"
              :value="stat.value"
              :icon="stat.icon"
              :color="stat.color as ColorVariant"
              format="compact"
              :loading="loading"
            />
          </div>

          <!-- Filters -->
          <UPageCard
            title="Filter & Search"
            description="Filter proxy by status, category, and protocol"
            :ui="{
              container:
                'shadow-md border border-info/20 dark:border-info/35 rounded-lg',
            }"
            class="mb-6 w-full shadow-sm"
          >
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <UInput
                v-model="filters.search"
                icon="i-heroicons-magnifying-glass"
                placeholder="Cari host / ASN…"
              />
              <USelect
                v-model="filters.status"
                :items="[
                  {
                    label: 'Semua Status',
                    value: 'all',
                  },
                  {
                    label: 'Pending',
                    value: 'pending',
                  },
                  {
                    label: 'Checking',
                    value: 'checking',
                  },
                  {
                    label: 'Active',
                    value: 'active',
                  },
                  {
                    label: 'Dead',
                    value: 'dead',
                  },
                  {
                    label: 'Banned',
                    value: 'banned',
                  },
                ]"
                class="w-full"
              />
              <USelect
                v-model="filters.category"
                :items="[
                  {
                    label: 'Semua Kategori',
                    value: 'all',
                  },
                  {
                    label: 'Residential',
                    value: 'RESIDENTIAL_ROTATING',
                  },
                  {
                    label: 'Mobile',
                    value: 'MOBILE_ROTATING',
                  },
                ]"
                class="w-full"
              />
              <USelect
                v-model="filters.protocol"
                :items="[
                  {
                    label: 'Semua Protokol',
                    value: 'all',
                  },
                  {
                    label: 'HTTP',
                    value: 'http',
                  },
                  {
                    label: 'HTTPS',
                    value: 'https',
                  },
                  {
                    label: 'SOCKS5',
                    value: 'socks5',
                  },
                ]"
                class="w-full"
              />
              <USelectMenu
                v-model="filterCountry"
                :items="[
                  ...CountryList.map((c) => ({
                    label: c.name,
                    value: c.code.toUpperCase(),
                  })),
                ]"
                clear
                :search-input="{
                  placeholder: 'Filter...',
                  icon: 'i-lucide-search',
                }"
                :ui="{
                  input: 'h-10 w-full',
                }"
                class="w-full"
                @update:model-value="
                  (val) => {
                    if (val) {
                      filters.country = val?.value;
                    }
                  }
                "
                @clear="
                  () => {
                    filterCountry = { label: 'Semua', value: 'all' };
                    fetchProxies();
                  }
                "
              />
              <USelect
                v-model.number="limit"
                :items="[
                  {
                    label: '20',
                    value: 20,
                  },
                  {
                    label: '50',
                    value: 50,
                  },
                  {
                    label: '100',
                    value: 100,
                  },
                  {
                    label: '500',
                    value: 500,
                  },
                ]"
                class="w-full"
              />
            </div>
          </UPageCard>

          <!-- Bulk action bar -->
          <div
            v-if="selected.size > 0"
            class="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm"
          >
            <span>{{ selected.size }} proxy terpilih</span>
            <div class="flex items-center gap-2">
              <UButton
                size="sm"
                color="primary"
                variant="soft"
                icon="i-heroicons-bolt"
                :loading="loading"
                @click="checkSelected"
              >
                Check terpilih
              </UButton>
              <UButton
                size="sm"
                color="error"
                variant="soft"
                icon="i-heroicons-trash"
                :loading="loading"
                @click="bulkDelete"
              >
                Hapus terpilih
              </UButton>
            </div>
          </div>

          <!-- Table -->
          <div
            class="overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-800"
          >
            <table class="w-full text-sm">
              <thead
                class="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900/50 dark:text-neutral-400"
              >
                <tr>
                  <th class="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      :checked="allSelected"
                      class="cursor-pointer"
                      @change="toggleAll"
                    />
                  </th>
                  <th class="px-4 py-3 font-medium">Host : Port</th>
                  <th class="px-4 py-3 font-medium">Protocol</th>
                  <th class="px-4 py-3 font-medium">Category</th>
                  <th class="px-4 py-3 font-medium">Country</th>
                  <th class="px-4 py-3 font-medium">ISP / ASN</th>
                  <th class="px-4 py-3 font-medium">Latency</th>
                  <th class="px-4 py-3 font-medium">Status</th>
                  <th class="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody
                class="divide-y divide-neutral-100 dark:divide-neutral-800"
              >
                <tr v-if="loading">
                  <td colspan="9" class="px-4 py-10 text-center text-muted">
                    Memuat…
                  </td>
                </tr>
                <tr v-else-if="rows.length === 0">
                  <td colspan="9" class="px-4 py-12 text-center text-muted">
                    Belum ada proxy. Klik
                    <span class="font-medium">Import Proxy</span> untuk mulai.
                  </td>
                </tr>
                <tr
                  v-for="row in rows"
                  v-else
                  :key="row.id"
                  class="hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
                >
                  <td class="px-4 py-3">
                    <input
                      type="checkbox"
                      :checked="selected.has(row.id)"
                      class="cursor-pointer"
                      @change="toggleSelect(row.id)"
                    />
                  </td>
                  <td class="px-4 py-3 font-mono">
                    {{ row.host }}:{{ row.port }}
                  </td>
                  <td class="px-4 py-3 uppercase">{{ row.protocol }}</td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
                      :class="
                        row.isMobile
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                      "
                    >
                      {{ categoryLabel(row) }}
                    </span>
                  </td>
                  <td class="px-4 py-3">{{ row.country || "—" }}</td>
                  <td
                    class="max-w-26 truncate px-4 py-3"
                    :title="row.asnOrg || ''"
                  >
                    {{ row.asnOrg || "—" }}
                  </td>
                  <td class="px-4 py-3">
                    {{ row.latencyMs != null ? `${row.latencyMs} ms` : "—" }}
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-flex rounded-full border px-2 py-0.5 text-xs capitalize"
                      :class="statusColor[row.status]"
                    >
                      {{ row.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex justify-end gap-1">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        icon="i-heroicons-arrow-path"
                        :loading="busyId === row.id"
                        title="Re-check"
                        @click="recheckOne(row.id)"
                      />
                      <UButton
                        size="xs"
                        color="error"
                        variant="ghost"
                        icon="i-heroicons-trash"
                        :disabled="busyId === row.id"
                        title="Hapus"
                        @click="deleteOne(row.id)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          <div
            v-if="meta.totalPages > 1"
            class="flex items-center justify-between text-sm"
          >
            <span class="text-muted">
              Halaman {{ meta.page }} / {{ meta.totalPages }}
            </span>
            <div class="flex gap-2">
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="page <= 1"
                @click="page--"
              >
                Sebelumnya
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="!meta.has_more"
                @click="page++"
              >
                Berikutnya
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Modal (hand-rolled, andal lintas versi) -->

      <UModal v-model:open="importOpen" title="Import Proxy">
        <template #body>
          <div class="space-y-4">
            <div class="space-y-4">
              <div>
                <label class="mb-1 block text-sm font-medium">
                  Daftar proxy
                </label>
                <UTextarea
                  v-model="importForm.raw"
                  :rows="8"
                  placeholder="ip:port&#10;ip:port:user:pass&#10;user:pass@ip:port&#10;socks5://ip:port"
                  class="w-full rounded-md border border-neutral-300 bg-transparent p-3 font-mono text-xs dark:border-neutral-700"
                />
                <div class="mt-2 flex items-center justify-between gap-2">
                  <p class="text-xs text-muted">
                    Satu proxy per baris. Format campuran didukung; baris
                    diawali
                    <code>#</code> diabaikan.
                  </p>
                  <label
                    class="shrink-0 cursor-pointer rounded-md border border-neutral-300 px-2.5 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    <UIcon
                      name="i-heroicons-document-arrow-up"
                      class="mr-1 inline size-3.5"
                    />
                    Upload .txt / .csv
                    <input
                      type="file"
                      accept=".txt,.csv,text/plain,text/csv"
                      class="hidden"
                      @change="onFileChange"
                    />
                  </label>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-sm font-medium">
                    Protokol default
                  </label>
                  <USelect
                    v-model="importForm.defaultProtocol"
                    :items="[
                      {
                        label: 'HTTP',
                        value: 'http',
                      },
                      {
                        label: 'HTTPS',
                        value: 'https',
                      },
                      {
                        label: 'SOCKS5',
                        value: 'socks5',
                      },
                    ]"
                    class="w-full"
                  />
                  <p class="mt-1 text-xs text-muted">
                    Dipakai bila baris tidak menyebut protokol.
                  </p>
                </div>
                <div>
                  <label class="mb-1 block text-sm font-medium">
                    Label sumber (opsional)
                  </label>
                  <UInput
                    v-model="importForm.sourceLabel"
                    placeholder="mis. Vendor A"
                  />
                </div>
              </div>

              <!-- Hasil import -->
              <div
                v-if="importResult"
                class="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900/50"
              >
                <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span class="text-muted">Ditemukan valid</span>
                  <span class="font-medium">{{ importResult.found }}</span>
                  <span class="text-muted">Berhasil diimpor</span>
                  <span class="font-medium text-emerald-400">
                    {{ importResult.imported }}
                  </span>
                  <span class="text-muted">Duplikat (sudah ada)</span>
                  <span class="font-medium">{{
                    importResult.dbDuplicates
                  }}</span>
                  <span class="text-muted">Duplikat dalam input</span>
                  <span class="font-medium">
                    {{ importResult.batchDuplicates }}
                  </span>
                  <span class="text-muted">Baris tidak valid</span>
                  <span class="font-medium text-amber-400">
                    {{ importResult.invalid.length }}
                  </span>
                </div>
                <details v-if="importResult.invalid.length" class="mt-2">
                  <summary class="cursor-pointer text-xs text-amber-400">
                    Lihat baris bermasalah
                  </summary>
                  <ul class="mt-1 max-h-32 overflow-y-auto text-xs">
                    <li
                      v-for="(inv, i) in importResult.invalid"
                      :key="i"
                      class="font-mono text-muted"
                    >
                      {{ inv.raw }} — {{ inv.reason }}
                    </li>
                  </ul>
                </details>
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                size="md"
                :disabled="loading"
                @click="importOpen = false"
              >
                Tutup
              </UButton>
              <UButton
                color="primary"
                size="md"
                class="text-white"
                :disabled="loading"
                :loading="loading"
                @click="submitImport"
              >
                Import
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <!-- Scrape Modal -->
      <UModal v-model:open="scrapeOpen" title="Scrape Proxy">
        <template #body>
          <div class="space-y-4">
            <div>
              <label class="mb-2 block text-sm font-medium">Sumber</label>
              <div class="grid grid-cols-2 gap-2">
                <label
                  v-for="src in SCRAPE_SOURCES"
                  :key="src.value"
                  class="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                  :class="
                    scrapeForm.sources.includes(src.value)
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-neutral-300 dark:border-neutral-700'
                  "
                >
                  <input
                    type="checkbox"
                    :checked="scrapeForm.sources.includes(src.value)"
                    @change="toggleSource(src.value)"
                  />
                  {{ src.label }}
                </label>
              </div>
              <p class="mt-1 text-xs text-muted">
                spys.one butuh worker dengan Playwright (lebih lambat).
              </p>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium">
                  Country (ISO-2)
                </label>
                <USelectMenu
                  v-model="countrySelect"
                  :items="[
                    ...CountryList.map((c) => ({
                      label: c.name,
                      value: c.code.toUpperCase(),
                    })),
                    {
                      label: 'Semua',
                      value: 'all',
                    },
                  ]"
                  clear
                  :search-input="{
                    placeholder: 'Filter...',
                    icon: 'i-lucide-search',
                  }"
                  :ui="{
                    input: 'h-7 w-full',
                  }"
                  class="w-full"
                  @update:model-value="
                    (val) => {
                      if (val) {
                        scrapeForm.country = val?.value;
                      }
                    }
                  "
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Protokol</label>
                <USelect
                  v-model="scrapeForm.protocol"
                  :items="[
                    { label: 'Semua', value: 'all' },
                    { label: 'HTTP', value: 'http' },
                    { label: 'HTTPS', value: 'https' },
                    { label: 'SOCKS5', value: 'socks5' },
                  ]"
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Anonimitas</label>
                <USelect
                  v-model="scrapeForm.anonymity"
                  :items="[
                    { label: 'Semua', value: 'all' },
                    { label: 'Elite', value: 'elite' },
                    { label: 'Anonymous', value: 'anonymous' },
                    { label: 'Transparent', value: 'transparent' },
                  ]"
                  class="w-full"
                />
              </div>
            </div>

            <!-- Status job -->
            <div v-if="scrapeJobs.length" class="space-y-1">
              <label class="block text-sm font-medium">Job terakhir</label>
              <div
                class="max-h-40 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800"
              >
                <div
                  v-for="job in scrapeJobs.slice(0, 8)"
                  :key="job.id"
                  class="flex items-center justify-between border-b px-3 py-1.5 text-xs last:border-0 dark:border-neutral-800"
                >
                  <span class="font-mono">{{ job.source }}</span>
                  <span class="flex items-center gap-2">
                    <span class="text-muted">
                      {{ job.imported }}/{{ job.found }}
                    </span>
                    <span
                      class="rounded-full border px-2 py-0.5 capitalize"
                      :class="
                        job.status === 'done'
                          ? 'border-emerald-500/30 text-emerald-400'
                          : job.status === 'failed'
                            ? 'border-red-500/30 text-red-400'
                            : 'border-sky-500/30 text-sky-400'
                      "
                    >
                      {{ job.status }}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="loading"
                @click="scrapeOpen = false"
              >
                Tutup
              </UButton>
              <UButton
                color="success"
                size="md"
                class="text-white"
                :loading="loading"
                :disabled="loading"
                @click="submitScrape"
              >
                Mulai Scrape
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </AppDashboardLayout>
</template>

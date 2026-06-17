<script setup lang="ts">
import type {
  FormSubmitEvent,
  FormErrorEvent,
  FormErrorWithId,
} from "@nuxt/ui";
import FlagIcon, { type CountryCode } from "vue3-flag-icons";

const { proxies, isLoading, scrape } = useTools();
const { importResult, loading, importProxy } = useProxy();
const toast = useAppToast();

const state = reactive({
  sources: "free-proxy-list",
  country: "",
  protocol: "all",
  anonymity: "all",
});

const slectedCountries = ref<{ label: string; value: string }>();
const errorMessage = ref<FormErrorWithId[]>();
const importOpen = ref(false);
const importForm = reactive({
  raw: "",
  defaultProtocol: "http" as "http" | "https" | "socks5",
  sourceLabel: "",
});

const onSubmit = async (event: FormSubmitEvent<ToolsScrapeOutput>) => {
  proxies.value = [];
  const payload = {
    sources: state.sources,
    country: state.country.trim() || undefined,
    protocol: state.protocol !== "all" ? state.protocol : undefined,
    anonymity: state.anonymity !== "all" ? state.anonymity : undefined,
  };
  await scrape(payload as ToolsScrapeInput);
  resetForm();
};

function setError(event: FormErrorEvent) {
  errorMessage.value = event.errors;
}

watch(slectedCountries, (newVal) => {
  state.country = newVal?.value ?? "";
});

function downloadProxies() {
  const proxyArr = proxies.value.map((p) => `${p.host}:${p.port}`);
  const blob = new Blob([proxyArr?.join("\n") || ""], {
    type: "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proxies-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyProxies() {
  try {
    const proxyArr = proxies.value.map((p) => `${p.host}:${p.port}`);
    await navigator.clipboard.writeText(proxyArr?.join("\n") || "");
    toast.success("Proxies copied to clipboard");
  } catch (error) {
    toast.error("Failed to copy proxies to clipboard");
  }
}

function resetForm() {
  state.sources = "free-proxy-list";
  state.country = "";
  state.protocol = "all";
  state.anonymity = "all";
  slectedCountries.value = undefined;
  errorMessage.value = [];
}

function openImport() {
  importForm.raw = proxies.value.map((p) => `${p.host}:${p.port}`).join("\n");
  importForm.sourceLabel = state.sources;
  importForm.defaultProtocol =
    state.protocol !== "all"
      ? (state.protocol as "http" | "https" | "socks5")
      : "http";
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
  setTimeout(async () => {
    await navigateTo("/app/proxies");
  }, 1000);
}

const sourcesOptions = [
  {
    label: "All",
    value: "all",
  },
  {
    label: "Free Proxy List",
    value: "free-proxy-list",
  },
  {
    label: "SSL Proxies",
    value: "sslproxies",
  },
  {
    label: "US Proxies",
    value: "us-proxy",
  },
  {
    label: "SPYs One",
    value: "spys-one",
  },
  {
    label: "Proxy Scrape",
    value: "proxyscrape",
  },
  {
    label: "Proxy Daily",
    value: "proxy-daily",
  },
  {
    label: "Sunny Proxy",
    value: "sunny-proxy",
  },
  {
    label: "Geonode",
    value: "geonode",
  },
  {
    label: "Hide MN",
    value: "hide-mn",
  },
  {
    label: "Open Proxy",
    value: "openproxy",
  },
  {
    label: "Open Proxy List",
    value: "openproxylist",
  },
  {
    label: "Proxy DB",
    value: "proxydb",
  },
  {
    label: "Proxy Nova",
    value: "proxynova",
  },
  {
    label: "Free Proxy World",
    value: "freeproxy-world",
  },
];

const protocolOptions = [
  { label: "All", value: "all" },
  { label: "HTTP", value: "http" },
  { label: "HTTPS", value: "https" },
  { label: "SOCKS5", value: "socks5" },
];

const anonymityOptions = [
  { label: "All", value: "all" },
  { label: "Transparent", value: "transparent" },
  { label: "Anonymous", value: "anonymous" },
  { label: "Elite", value: "elite" },
];

onBeforeRouteLeave((to, from) => {
  if (isLoading.value) {
    const confirmLeave = window.confirm(
      "Proses sedang berjalan. Apakah Anda yakin ingin keluar?",
    );
    if (!confirmLeave) {
      return false; // Membatalkan perpindahan rute
    }
  }
});

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (isLoading.value) {
    event.preventDefault();
    event.returnValue = "";
  }
};
onMounted(() => {
  window.addEventListener("beforeunload", handleBeforeUnload);
});
onUnmounted(() => {
  window.removeEventListener("beforeunload", handleBeforeUnload);
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="errorMessage && errorMessage.length > 0" class="space-y-2">
      <UAlert
        v-for="error in errorMessage"
        :key="error.id"
        color="error"
        :title="error.name"
        :description="error.message"
        icon="material-symbols:warning-rounded"
      />
    </div>

    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">Proxy Scraper</h3>
      </template>
      <UForm
        :schema="toolsScrapeSchema"
        :state="state as ToolsScrapeInput"
        class="space-y-4"
        @submit="onSubmit"
        @error="setError"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Proxy Source">
            <USelect
              v-model="state.sources"
              :items="sourcesOptions"
              name="sources"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Proxy Protocol">
            <USelect
              v-model="state.protocol"
              :items="protocolOptions"
              name="protocol"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Proxy Anonymity">
            <USelect
              v-model="state.anonymity"
              :items="anonymityOptions"
              name="anonymity"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Proxy Country">
            <USelectMenu
              v-model="slectedCountries"
              :items="
                CountryList.map((c) => ({ label: c.name, value: c.code }))
              "
              placeholder="Select countries"
              icon="material-symbols:add-location"
              size="md"
              class="w-full"
              clear
              :disabled="isLoading"
            >
              <template #item-leading="{ item }">
                <FlagIcon
                  :code="item.value as CountryCode"
                  class="w-4 h-4 inline-block"
                />
              </template>
              <template #item-label="{ item }">
                <span>{{ item.label }}</span>
              </template>
            </USelectMenu>
          </UFormField>
        </div>
        <div class="flex items-center justify-end">
          <UButton
            type="submit"
            color="primary"
            icon="i-lucide-search"
            size="md"
            class="text-white"
            :loading="isLoading"
            :disabled="isLoading"
          >
            {{ isLoading ? "Scraping..." : "Scrape Proxies" }}
          </UButton>
        </div>
      </UForm>
    </UCard>
    <UCard v-if="proxies?.length > 0">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-semibold">
            Scraped Proxies ({{ proxies?.length }})
          </h3>
          <div class="flex gap-2">
            <UButton
              size="sm"
              variant="outline"
              icon="i-lucide-copy"
              @click="copyProxies"
            >
              Copy
            </UButton>
            <UButton
              size="sm"
              color="primary"
              class="text-white"
              icon="i-heroicons-arrow-up-tray"
              @click="openImport"
            >
              Import
            </UButton>
            <UButton
              size="sm"
              variant="outline"
              icon="i-lucide-download"
              @click="downloadProxies"
            >
              Download
            </UButton>
          </div>
        </div>
      </template>
      <div class="max-h-96 overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-muted">
            <tr>
              <th class="text-left p-2">#</th>
              <th class="text-left p-2">host</th>
              <th class="text-left p-2">port</th>
              <th class="text-left p-2">protocol</th>
              <th class="text-left p-2">anonymity</th>
              <th class="text-left p-2">country</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(proxy, index) in proxies.slice(0, 200)" :key="index">
              <td class="text-left p-2">{{ index + 1 }}</td>
              <td class="text-left p-2">{{ proxy.host }}</td>
              <td class="text-left p-2">{{ proxy.port }}</td>
              <td class="text-left p-2">{{ proxy.protocol }}</td>
              <td class="text-left p-2">{{ proxy.anonymity }}</td>
              <td class="text-left p-2">{{ proxy.country }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

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
                <span class="font-medium">{{ importResult.dbDuplicates }}</span>
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

    <UModal v-model="isLoading" prevent-close :ui="{ wrapper: 'sm:max-w-xs' }">
      <div class="p-6 flex flex-col items-center justify-center space-y-4">
        <div
          class="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"
        ></div>
        <p
          class="text-sm font-medium text-neutral-600 dark:text-neutral-400 animate-pulse"
        >
          Sedang memproses data...
        </p>
      </div>
    </UModal>
  </div>
</template>

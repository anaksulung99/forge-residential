<script setup lang="ts">
import type {
  FormSubmitEvent,
  FormErrorEvent,
  FormErrorWithId,
} from "@nuxt/ui";
import FlagIcon, { type CountryCode } from "vue3-flag-icons";

const { proxies, isLoading, scrape } = useTools();
const toast = useAppToast();

const state = reactive({
  sources: "free-proxy-list",
  country: "",
  protocol: "all",
  anonymity: "all",
});

const slectedCountries = ref<{ label: string; value: string }>();
const errorMessage = ref<FormErrorWithId[]>();

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
          <h3 class="text-lg font-semibold">Scraped Proxies</h3>
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
            <tr v-for="(proxy, index) in proxies" :key="index">
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
  </div>
</template>

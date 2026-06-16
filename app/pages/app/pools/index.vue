<script setup lang="ts">
definePageMeta({
  layout: "auth",
  middleware: "auth",
});
useSeoMeta({
  title: "Rotating Pools",
  description: "Kelola rotating proxy pool & endpoint gateway.",
  robots: "noindex, nofollow",
});

const toast = useAppToast();
const config = useRuntimeConfig();
const gwHost = (config.public.GatewayHost as string) || "localhost";
const gwPort = (config.public.GatewayPort as string) || "10000";

interface Pool {
  id: string;
  name: string;
  category: "RESIDENTIAL_ROTATING" | "MOBILE_ROTATING";
  isDefault: boolean;
  isActive: boolean;
  rotationMode: "per_request" | "sticky";
  stickyTtlSec: number | null;
  filterCountry: string | null;
  filterProtocol: string | null;
  gatewayUsername: string;
  gatewayPassword: string;
  totalMembers: number;
  activeMembers: number;
}

const pools = ref<Pool[]>([]);
const loading = ref(false);

async function fetchPools() {
  loading.value = true;
  try {
    const res = await $fetch<{ data: Pool[] }>("/api/pools");
    pools.value = res.data;
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal memuat pool.");
  } finally {
    loading.value = false;
  }
}
onMounted(fetchPools);

function connString(p: Pool) {
  return `http://${p.gatewayUsername}:${p.gatewayPassword}@${gwHost}:${gwPort}`;
}
function curlExample(p: Pool) {
  return `curl -x "${connString(p)}" https://api.ipify.org`;
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Disalin ke clipboard.");
  } catch {
    toast.error("Gagal menyalin.");
  }
}

async function updatePool(p: Pool, data: Record<string, unknown>) {
  try {
    await $fetch(`/api/pools/${p.id}`, { method: "PATCH", body: data });
    Object.assign(p, data);
    toast.success("Pool diperbarui.");
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal memperbarui.");
    await fetchPools();
  }
}

async function regenerate(p: Pool) {
  if (!confirm("Buat ulang kredensial? Endpoint lama akan berhenti bekerja."))
    return;
  try {
    const res = await $fetch<{
      data: { gatewayUsername: string; gatewayPassword: string };
    }>(`/api/pools/${p.id}/regenerate`, { method: "POST" });
    p.gatewayUsername = res.data.gatewayUsername;
    p.gatewayPassword = res.data.gatewayPassword;
    toast.success("Kredensial diperbarui.");
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal regenerate.");
  }
}

async function removePool(p: Pool) {
  if (!confirm(`Hapus pool "${p.name}"?`)) return;
  try {
    await $fetch(`/api/pools/${p.id}`, { method: "DELETE" });
    toast.success("Pool dihapus.");
    await fetchPools();
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal menghapus.");
  }
}

// ── Create modal ──────────────────────────────────────
const createOpen = ref(false);
const creating = ref(false);
const createForm = reactive({
  name: "",
  category: "RESIDENTIAL_ROTATING" as Pool["category"],
  rotationMode: "per_request" as Pool["rotationMode"],
  stickyTtlSec: 600,
});

async function submitCreate() {
  if (!createForm.name.trim()) {
    toast.warning("Nama pool wajib diisi.");
    return;
  }
  creating.value = true;
  try {
    await $fetch("/api/pools", {
      method: "POST",
      body: {
        name: createForm.name,
        category: createForm.category,
        rotationMode: createForm.rotationMode,
        stickyTtlSec:
          createForm.rotationMode === "sticky"
            ? createForm.stickyTtlSec
            : undefined,
      },
    });
    toast.success("Pool dibuat.");
    createOpen.value = false;
    createForm.name = "";
    await fetchPools();
  } catch (err: any) {
    toast.error(err?.data?.message || "Gagal membuat pool.");
  } finally {
    creating.value = false;
  }
}

function categoryLabel(p: Pool) {
  return p.category === "MOBILE_ROTATING" ? "Mobile" : "Residential";
}
</script>

<template>
  <AppDashboardLayout id="pools" title="Rotating Pools">
    <template #content>
      <div class="min-h-screen p-4 md:p-6">
        <div class="mx-auto max-w-7xl space-y-5">
          <!-- Header -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 class="text-xl font-semibold">Rotating Pools</h1>
              <p class="text-sm text-muted">
                Endpoint rotating yang dipakai client — 1 endpoint per pool.
              </p>
            </div>
            <UButton
              icon="i-heroicons-plus"
              color="primary"
              size="md"
              class="text-white"
              @click="createOpen = true"
            >
              Buat Pool
            </UButton>
          </div>

          <div v-if="loading" class="py-12 text-center text-muted">Memuat…</div>

          <!-- Pool cards -->
          <div v-else class="grid gap-4 lg:grid-cols-2">
            <UCard v-for="p in pools" :key="p.id">
              <template #header>
                <!-- Title row -->
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <h3 class="font-semibold">{{ p.name }}</h3>
                      <span
                        class="rounded-full border px-2 py-0.5 text-xs"
                        :class="
                          p.category === 'MOBILE_ROTATING'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                        "
                      >
                        {{ categoryLabel(p) }}
                      </span>
                      <span
                        v-if="p.isDefault"
                        class="rounded-full border border-neutral-400/30 px-2 py-0.5 text-xs text-muted"
                      >
                        default
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-muted">
                      <span class="text-emerald-400">{{
                        p.activeMembers
                      }}</span>
                      aktif / {{ p.totalMembers }} member
                    </p>
                  </div>
                  <div class="flex items-center gap-1">
                    <UButton
                      :icon="
                        p.isActive
                          ? 'i-heroicons-pause-circle'
                          : 'i-heroicons-play-circle'
                      "
                      :color="p.isActive ? 'warning' : 'success'"
                      variant="ghost"
                      size="xs"
                      :title="p.isActive ? 'Nonaktifkan' : 'Aktifkan'"
                      @click="updatePool(p, { isActive: !p.isActive })"
                    />
                    <UButton
                      v-if="!p.isDefault"
                      icon="i-heroicons-trash"
                      color="error"
                      variant="ghost"
                      size="xs"
                      title="Hapus"
                      @click="removePool(p)"
                    />
                  </div>
                </div>
              </template>
              <!-- Connection string -->
              <div>
                <label class="mb-1 block text-xs font-medium text-muted">
                  Endpoint (proxy URL)
                </label>
                <div class="flex items-center gap-2">
                  <code
                    class="flex-1 truncate rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs dark:border-neutral-800 dark:bg-neutral-900/50"
                    :title="connString(p)"
                  >
                    {{ connString(p) }}
                  </code>
                  <UButton
                    icon="i-heroicons-clipboard-document"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="copy(connString(p))"
                  />
                </div>
                <button
                  class="mt-1 text-xs text-info hover:underline"
                  @click="copy(curlExample(p))"
                >
                  Salin contoh curl
                </button>
              </div>

              <!-- Settings -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="mb-1 block text-xs font-medium text-muted">
                    Rotasi
                  </label>
                  <USelect
                    :model-value="p.rotationMode"
                    :items="[
                      { label: 'Per request', value: 'per_request' },
                      { label: 'Sticky session', value: 'sticky' },
                    ]"
                    class="w-full"
                    @update:model-value="
                      (v: any) => updatePool(p, { rotationMode: v })
                    "
                  />
                </div>
                <div v-if="p.rotationMode === 'sticky'">
                  <label class="mb-1 block text-xs font-medium text-muted">
                    Sticky TTL (detik)
                  </label>
                  <UInput
                    :model-value="p.stickyTtlSec ?? 600"
                    type="number"
                    class="w-full"
                    @blur="
                      (e: any) =>
                        updatePool(p, {
                          stickyTtlSec: Number(e.target.value) || 600,
                        })
                    "
                  />
                </div>
              </div>

              <template #footer>
                <!-- Credential actions -->
                <div
                  class="flex items-center justify-between border-t pt-3 dark:border-neutral-800"
                >
                  <span class="font-mono text-xs text-muted">
                    user: {{ p.gatewayUsername }}
                  </span>
                  <UButton
                    icon="i-heroicons-arrow-path"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="regenerate(p)"
                  >
                    Regenerate kredensial
                  </UButton>
                </div>
              </template>
            </UCard>
          </div>

          <!-- Usage hint -->
          <UAlert
            variant="soft"
            color="primary"
            class="rounded-lg border border-primary/20 p-4 text-sm text-muted"
          >
            <template #title>
              <p class="mb-1 font-medium text-info">Opsi via username</p>
            </template>
            <template #description>
              Tambahkan opsi di belakang username (dipisah <code>-</code>):
              <code class="text-xs">
                {username}-country-us-session-abc123-type-http
              </code>
              — <b>country</b> filter GEO, <b>session</b> untuk sticky IP,
              <b>type</b> http/https/socks5.
            </template>
          </UAlert>
        </div>
      </div>

      <!-- Create modal -->
      <UModal v-model:open="createOpen" title="Buat Pool">
        <template #body>
          <div class="space-y-4">
            <div>
              <label class="mb-1 block text-sm font-medium">Nama pool</label>
              <UInput
                v-model="createForm.name"
                placeholder="mis. US Mobile"
                class="w-full"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="mb-1 block text-sm font-medium">Kategori</label>
                <USelect
                  v-model="createForm.category"
                  :items="[
                    {
                      label: 'Residential',
                      value: 'RESIDENTIAL_ROTATING',
                    },
                    { label: 'Mobile', value: 'MOBILE_ROTATING' },
                  ]"
                  class="w-full"
                />
              </div>
              <div>
                <label class="mb-1 block text-sm font-medium">Rotasi</label>
                <USelect
                  v-model="createForm.rotationMode"
                  :items="[
                    { label: 'Per request', value: 'per_request' },
                    { label: 'Sticky session', value: 'sticky' },
                  ]"
                  class="w-full"
                />
              </div>
            </div>
            <div v-if="createForm.rotationMode === 'sticky'">
              <label class="mb-1 block text-sm font-medium">
                Sticky TTL (detik)
              </label>
              <UInput v-model.number="createForm.stickyTtlSec" type="number" />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="creating"
                @click="createOpen = false"
              >
                Batal
              </UButton>
              <UButton
                color="primary"
                class="text-white"
                :loading="creating"
                @click="submitCreate"
              >
                Buat
              </UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </AppDashboardLayout>
</template>

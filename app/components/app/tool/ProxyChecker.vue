<script setup lang="ts">
import type {
  FormSubmitEvent,
  FormErrorEvent,
  FormErrorWithId,
  RadioGroupItem,
} from "@nuxt/ui";

const config = useRuntimeConfig();
const { isLoading, proxyTestResult, testPool } = useTools();

const toast = useAppToast();

const state = reactive<TestProxyInput>({
  targetUrl: "",
  type: "Request",
  engine: "CHROMIUM",
  gwHost: config.public.GatewayHost,
  gwPort: parseInt(config.public.GatewayPort),
  headless: true,
  totalSessionsTarget: 20,
  maxConcurrency: 3,
  dailyLimit: 20,
  sessionsPerHour: 20,
  proxyPoolId: "",
  fingerprint: "",
  behaviour: "",
  clickSelectors: [],
  launchTimeout: 60000,
  navigationTimeout: 60000,
  trafficSource: "DIRECT",
  referer: "",
});

const poolSelected = ref<{ label: string; value: string }>({
  label: "",
  value: "",
});
const errorMessage = ref<FormErrorWithId[]>();

const {
  data: poolsOptions,
  status,
  execute,
} = await useLazyFetch("/api/pools", {
  key: "pools-options",
  transform: (data) => {
    return data.data?.map((pool) => ({
      label: pool.name,
      value: pool.id,
    }));
  },
  immediate: false,
});

watch(
  poolSelected,
  (newVal) => {
    state.proxyPoolId = newVal.value;
  },
  { immediate: true },
);

const onSubmit = async (event: FormSubmitEvent<TestProxyOutput>) => {
  const payload = {
    ...state,
    referer: state.referer?.trim() || undefined,
  };
  await testPool(payload as TestProxyInput);
  resetForm();
};

function onOpenPoolOption() {
  if (!poolsOptions.value?.length) {
    execute();
  }
}

function resetForm() {
  Object.assign(state, {
    targetUrl: "",
    type: "Request",
    engine: "CHROMIUM",
    gwHost: config.public.GatewayHost,
    gwPort: parseInt(config.public.GatewayPort),
    headless: true,
    totalSessionsTarget: 20,
    maxConcurrency: 3,
    dailyLimit: 20,
    sessionsPerHour: 20,
    proxyPoolId: "",
    fingerprint: "",
    behaviour: "",
    clickSelectors: [],
    launchTimeout: 60000,
    navigationTimeout: 60000,
    trafficSource: "DIRECT",
    referer: "",
  });
  poolSelected.value = { label: "", value: "" };
}

function setError(event: FormErrorEvent) {
  errorMessage.value = event.errors;
}

const testOptions: RadioGroupItem[] = [
  {
    label: "Playwright",
    description: "Test proxy with Playwright",
    value: "Playwright",
  },
  {
    label: "Request",
    description: "Test proxy with Request",
    value: "Request",
  },
];

const browserEngineOptions = [
  {
    label: "Chromium",
    value: "CHROMIUM",
  },
  {
    label: "Firefox",
    value: "FIREFOX",
  },
  {
    label: "Webkit",
    value: "WEBKIT",
  },
];

const trafficSourcesOptions = [
  {
    label: "Direct",
    value: "DIRECT",
  },
  {
    label: "Search",
    value: "SEARCH",
  },
  {
    label: "Social",
    value: "SOCIAL",
  },
  {
    label: "Referral",
    value: "REFERRAL",
  },
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
        <h3 class="text-lg font-semibold">Proxy Checker</h3>
      </template>

      <UForm
        :schema="testProxySchema"
        :state="state as TestProxyInput"
        class="space-y-4"
        @submit="onSubmit"
        @error="setError"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Target URL">
            <UInput
              v-model="state.targetUrl"
              placeholder=" Target URL"
              class="w-full bg-input"
            />
          </UFormField>
          <UFormField label="Gateway Host">
            <UInput
              v-model="state.gwHost"
              placeholder=" Gateway Host"
              class="w-full bg-input"
            />
          </UFormField>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Gateway Port">
            <UInput
              v-model.number="state.gwPort"
              type="number"
              placeholder="Gateway Port"
              class="w-full bg-input"
            />
          </UFormField>
          <UFormField label="Proxy Pool">
            <USelectMenu
              v-model="poolSelected"
              :items="poolsOptions"
              :loading="status === 'pending'"
              placeholder="Select pool"
              class="w-full h-10"
              @update:open="onOpenPoolOption"
            />
          </UFormField>
        </div>
        <UFormField label="Type Test" class="w-full">
          <URadioGroup
            v-model="state.type"
            color="primary"
            variant="table"
            :items="testOptions"
            orientation="horizontal"
          />
        </UFormField>

        <div v-if="state.type === 'Playwright'" class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Browser Engine">
              <USelect
                v-model="state.engine"
                :items="browserEngineOptions"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
            <UFormField label="Fingerprint">
              <USelect
                v-model="state.fingerprint"
                :items="
                  FINGERPRINT_PROFILE.map((item) => ({
                    label: item.name,
                    value: item.slug,
                  }))
                "
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Behaviour Profile">
              <USelect
                v-model="state.behaviour"
                :items="
                  BROWSER_BEHAVIOUR_PROFILE.map((item) => ({
                    label: item.name,
                    value: item.slug,
                  }))
                "
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
            <UFormField label="Total Sessions Target">
              <UInput
                v-model.number="state.totalSessionsTarget"
                type="number"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Max Concurrency">
              <UInput
                v-model.number="state.maxConcurrency"
                type="number"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
            <UFormField label="Daily Limit">
              <UInput
                v-model.number="state.dailyLimit"
                type="number"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="Sessions Per Hour">
              <UInput
                v-model.number="state.sessionsPerHour"
                type="number"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
            <UFormField label="Launch Timeout">
              <UInput
                v-model.number="state.launchTimeout"
                type="number"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UFormField label="traffic Source">
              <USelect
                v-model="state.trafficSource"
                :items="trafficSourcesOptions"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
            <UFormField
              v-if="state.trafficSource === 'REFERRAL'"
              label="Referrer"
            >
              <UInput
                v-model="state.referer"
                type="text"
                class="w-full bg-input"
                :disabled="isLoading"
              />
            </UFormField>
          </div>
        </div>
        <UCheckbox v-model="state.headless" label="Headless Mode" />
        <div class="flex items-center justify-end">
          <UButton
            type="submit"
            color="primary"
            icon="material-symbols-light:rocket-launch"
            size="md"
            class="text-white"
            :loading="isLoading"
            :disabled="isLoading"
          >
            {{ isLoading ? "Testing..." : "Check Proxy" }}
          </UButton>
        </div>
      </UForm>
    </UCard>
    <UCard v-if="proxyTestResult">
      <template #header>
        <h3 class="text-lg font-semibold">Test Result</h3>
      </template>
      <pre
        class="max-h-96 overflow-auto rounded-md bg-neutral-950 p-4 text-xs text-neutral-100"
      >{{ JSON.stringify(proxyTestResult, null, 2) }}</pre>
    </UCard>
    <UModal v-model:open="isLoading" :dismissible="false" :close="false">
      <template #content>
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
      </template>
    </UModal>
  </div>
</template>

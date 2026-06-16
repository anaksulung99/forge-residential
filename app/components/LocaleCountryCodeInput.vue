<script setup lang="ts">
import type { ClassValue } from "clsx";

interface SelectItem {
  label: string;
  value: string;
  description?: string;
}

const props = withDefaults(
  defineProps<{
    label?: string;
    value?: string | string[];
    name?: string;
    error?: string;
    class?: ClassValue;
    required?: boolean;
    placeholder?: string;
    multiple?: boolean;
    icon?: string;
    limit?: number;
    disabled?: boolean;
  }>(),
  {
    label: "Country Code",
    value: "en-US",
    name: "",
    error: "",
    class: "w-full",
    required: false,
    placeholder: "Select country...",
    multiple: false,
    icon: "lucide:languages",
    limit: 200,
    disabled: false,
  },
);

const emit = defineEmits<{
  (event: "update:value", value: string | string[]): void;
}>();

// ── Value binding (useVModel auto-unwraps in template) ───────────────────
const modelValue = useVModel(props, "value", emit, {
  passive: true,
  defaultValue: props.multiple ? [] : "UTC",
});

// ── Display value lookup ─────────────────────────────────────────────
const displayValue = computed(() => {
  const val = modelValue.value;
  if (!val) return "";
  if (Array.isArray(val)) {
    if (!val.length) return "";
    if (!countryItems.value?.length) {
      return `${val.length} country${val.length !== 1 ? "s" : ""} selected`;
    }
    const names = val
      .map((v) => countryItems.value?.find((t) => t.value === v)?.label ?? v)
      .join(", ");
    return names;
  }
  if (!countryItems.value?.length) return val;
  return countryItems.value.find((t) => t.value === val)?.label ?? val;
});
const searchQuery = ref("");
const isOpen = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const {
  data: countryItems,
  status,
  execute,
} = useLazyFetch("/api/geo/simplelocalize", {
  key: "country-code-select-input",
  query: computed(() => ({
    search: searchQuery.value,
    limit: props.limit ?? 500,
    offset: 0,
  })),
  immediate: false,
  server: false,
  watch: false,
  transform: (items: SimplelocalizeCountryItem[]) => {
    return (items ?? []).map(
      (item): SelectItem => ({
        label: item.country.name,
        value: item.locale,
        description: `${item.country.name} · ${item.country.region}`,
      }),
    );
  },
});

const debouncedSearch = useDebounceFn((val: string) => {
  searchQuery.value = val;
}, 250);

watch(searchQuery, (val) => {
  debouncedSearch(val);
});

function onOpen() {
  isOpen.value = true;
  if (!countryItems.value?.length) {
    execute();
  }
  nextTick(() => inputRef.value?.focus());
}

function onClose() {
  isOpen.value = false;
  searchQuery.value = "";
}

// ── Selection ──────────────────────────────────────────────────────────────
function toggleItem(item: SelectItem) {
  if (props.multiple) {
    const arr = Array.isArray(modelValue.value) ? [...modelValue.value] : [];
    const idx = arr.indexOf(item.value);
    if (idx > -1) arr.splice(idx, 1);
    else arr.push(item.value);
    modelValue.value = arr;
  } else {
    modelValue.value = item.value;
    onClose();
  }
}

function isSelected(item: SelectItem) {
  if (props.multiple) {
    return (
      Array.isArray(modelValue.value) && modelValue.value.includes(item.value)
    );
  }
  return modelValue.value === item.value;
}
</script>

<template>
  <UFormField
    :label="props.label"
    :name="props.name"
    :error="props.error"
    :required="props.required"
    :disabled="props.disabled"
  >
    <UPopover
      v-model:open="isOpen"
      :content="{
        align: 'start',
        sideOffset: 4,
      }"
      :ui="{
        content: 'w-[--popover-content-width] p-0',
      }"
    >
      <UButton
        color="neutral"
        variant="subtle"
        block
        :icon="props.icon"
        :class="cn('w-full justify-start text-left', props.class)"
        :disabled="props.disabled"
        @click="onOpen"
      >
        <template
          v-if="
            !modelValue || (Array.isArray(modelValue) && !modelValue.length)
          "
        >
          <span class="text-muted">{{ props.placeholder }}</span>
        </template>
        <template v-else>
          {{ displayValue }}
        </template>
      </UButton>

      <template #content>
        <div class="flex w-72 flex-col">
          <!-- Search -->
          <div class="border-b border-default p-2">
            <div class="relative">
              <Icon
                name="i-lucide-search"
                class="absolute top-1/2 left-2.5 -translate-y-1/2 h-3.5 w-3.5 text-muted"
              />
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                placeholder="Search country..."
                class="w-full rounded-md border border-default bg-default py-1.5 pe-2 ps-8 text-sm outline-none focus:border-primary-500"
              />
            </div>
          </div>

          <!-- Loading -->
          <div
            v-if="status === 'pending'"
            class="flex items-center justify-center py-8"
          >
            <Icon
              name="i-lucide-loader-2"
              class="h-5 w-5 animate-spin text-muted"
            />
          </div>

          <!-- Empty -->
          <div
            v-else-if="!countryItems?.length"
            class="py-8 text-center text-sm text-muted"
          >
            No countries found
          </div>

          <!-- Items -->
          <div v-else class="max-h-60 overflow-y-auto p-1">
            <button
              v-for="item in countryItems"
              :key="item.value"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              @click="toggleItem(item)"
            >
              <!-- Checkbox for multiple -->
              <div
                v-if="props.multiple"
                class="flex h-4 w-4 shrink-0 items-center justify-center rounded border-2"
                :class="
                  isSelected(item)
                    ? 'border-primary-500 bg-primary-500 text-white'
                    : 'border-neutral-300 dark:border-neutral-600'
                "
              >
                <Icon
                  v-if="isSelected(item)"
                  name="i-lucide-check"
                  class="h-3 w-3"
                />
              </div>

              <!-- Single check -->
              <Icon
                v-else-if="isSelected(item)"
                name="i-lucide-check"
                class="h-4 w-4 shrink-0 text-primary-500"
              />

              <div class="min-w-0 flex-1">
                <div
                  class="truncate text-sm font-medium"
                  :class="
                    isSelected(item)
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-default'
                  "
                >
                  {{ item.label }}
                </div>
                <div
                  v-if="item.description"
                  class="truncate text-xs text-muted"
                >
                  {{ item.description }}
                </div>
              </div>
            </button>
          </div>

          <!-- Footer count -->
          <div
            v-if="countryItems?.length"
            class="border-t border-default px-3 py-1.5 text-xs text-muted"
          >
            {{ countryItems.length }} country{{
              countryItems.length !== 1 ? "s" : ""
            }}
          </div>
        </div>
      </template>
    </UPopover>

    <template #hint>
      <slot name="hint" />
    </template>
  </UFormField>
</template>

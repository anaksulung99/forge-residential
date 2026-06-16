<script setup lang="ts">
definePageMeta({ layout: "default" });

const { t, locale, messages } = useI18n();
const { user } = useUserSession();
const localePath = useLocalePath();
const config = useRuntimeConfig();

useSeoMeta({
  title: "Smart Boost Labs — AI-Powered Traffic Exchange Platform",
  description:
    "Maximize your website traffic through our AI-optimized traffic exchange network. Real-time analytics, smart campaign management, and seamless integrations.",
  ogTitle: "Smart Boost Labs — AI-Powered Traffic Exchange Platform",
  ogDescription:
    "Maximize your website traffic through our AI-optimized traffic exchange network.",
  twitterCard: "summary_large_image",
});

const statsVisible = ref(false);
const statsRef = ref<HTMLElement | null>(null);

const stats = computed(() => [
  {
    value: "12,500+",
    label: t("hero.stats.activeUsers"),
    icon: "i-lucide-users",
  },
  {
    value: "48,000+",
    label: t("hero.stats.campaigns"),
    icon: "i-lucide-megaphone",
  },
  {
    value: "2.5M+",
    label: t("hero.stats.dailyImpressions"),
    icon: "i-lucide-eye",
  },
  { value: "140+", label: t("hero.stats.countries"), icon: "i-lucide-globe" },
]);

const features = computed(() => [
  {
    icon: "i-lucide-brain",
    iconBg: "bg-purple-500/10 dark:bg-purple-500/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    title: t("features.items.aiRouting.title"),
    description: t("features.items.aiRouting.description"),
    badge: "AI",
  },
  {
    icon: "i-lucide-activity",
    iconBg: "bg-blue-500/10 dark:bg-blue-500/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    title: t("features.items.realTimeAnalytics.title"),
    description: t("features.items.realTimeAnalytics.description"),
    badge: "Live",
  },
  {
    icon: "i-lucide-rocket",
    iconBg: "bg-green-500/10 dark:bg-green-500/20",
    iconColor: "text-green-600 dark:text-green-400",
    title: t("features.items.smartCampaigns.title"),
    description: t("features.items.smartCampaigns.description"),
    badge: "Smart",
  },
  {
    icon: "i-lucide-server-cog",
    iconBg: "bg-orange-500/10 dark:bg-orange-500/20",
    iconColor: "text-orange-600 dark:text-orange-400",
    title: t("features.items.workerSystem.title"),
    description: t("features.items.workerSystem.description"),
    badge: "Scale",
  },
  {
    icon: "material-symbols-light:vpn-lock-rounded",
    iconBg: "bg-cyan-500/10 dark:bg-cyan-500/20",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    title: t("features.items.proxyIntegration.title"),
    description: t("features.items.proxyIntegration.description"),
    badge: "Geo",
  },
  {
    icon: "i-lucide-plug",
    iconBg: "bg-pink-500/10 dark:bg-pink-500/20",
    iconColor: "text-pink-600 dark:text-pink-400",
    title: t("features.items.integrationHub.title"),
    description: t("features.items.integrationHub.description"),
    badge: "API",
  },
]);

const localeMessages = computed(() => messages.value as Record<string, any>);

const finalPlans = computed(() => {
  return (localeMessages.value?.[locale.value as string]?.pricing as any) || {};
});

function normalizeFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f: any) => {
      if (typeof f === "string") return f;
      const maybe = f?.body?.static;
      if (typeof maybe === "string") return maybe;
      return "";
    })
    .filter(Boolean);
}

const plans = computed(() => [
  {
    id: "free",
    name: t("pricing.free.name"),
    price: t("pricing.free.price"),
    period: t("pricing.free.period"),
    description: t("pricing.free.description"),
    features: normalizeFeatures(finalPlans.value.free?.features),
    cta: t("pricing.free.cta"),
    variant: "outline" as const,
  },
  {
    id: "starter",
    name: t("pricing.starter.name"),
    price: t("pricing.starter.price"),
    period: t("pricing.starter.period"),
    description: t("pricing.starter.description"),
    features: normalizeFeatures(finalPlans.value.starter?.features),
    cta: t("pricing.starter.cta"),
    variant: "outline" as const,
  },
  {
    id: "pro",
    name: t("pricing.pro.name"),
    price: t("pricing.pro.price"),
    period: t("pricing.pro.period"),
    description: t("pricing.pro.description"),
    features: normalizeFeatures(finalPlans.value.pro?.features),
    cta: t("pricing.pro.cta"),
    variant: "solid" as const,
    popular: true,
  },
  {
    id: "enterprise",
    name: t("pricing.enterprise.name"),
    price: t("pricing.enterprise.price"),
    period: t("pricing.enterprise.period"),
    description: t("pricing.enterprise.description"),
    features: normalizeFeatures(finalPlans.value.enterprise?.features),
    cta: t("pricing.enterprise.cta"),
    variant: "outline" as const,
  },
]);

const steps = computed(() => [
  {
    number: "01",
    title: t("howItWorks.steps.step1.title"),
    description: t("howItWorks.steps.step1.description"),
    icon: "i-lucide-file-plus",
  },
  {
    number: "02",
    title: t("howItWorks.steps.step2.title"),
    description: t("howItWorks.steps.step2.description"),
    icon: "i-lucide-server",
  },
  {
    number: "03",
    title: t("howItWorks.steps.step3.title"),
    description: t("howItWorks.steps.step3.description"),
    icon: "i-lucide-rocket",
  },
]);

onMounted(() => {
  // console.log(localeMessages.value.en.pricing?.free.features[0].body.static);
  // console.log(finalPlans.value);
  // console.log(plans.value[0]?.features);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          statsVisible.value = true;
          observer.disconnect();
        }
      });
    },
    { threshold: 0.3 },
  );
  if (statsRef.value) observer.observe(statsRef.value);
  onUnmounted(() => observer.disconnect());
});
</script>

<template>
  <div class="relative overflow-hidden min-h-screen">
    <GreenParticleBackground
      :particle-count="80"
      color="#22c55e"
      :size="{ min: 1, max: 4 }"
      speed="normal"
      gradient-from="transparent"
      gradient-to="rgba(34, 197, 94, 0.12)"
    />

    <section
      className="flex flex-col items-center justify-center px-4 relative overflow-x-clip"
    >
      <DeviceParalaxAnimation />
      <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 lg:pt-32">
        <div class="text-center max-w-4xl mx-auto">
          <!-- Badge -->

          <div
            class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-linear-to-r from-emerald-700 via-lime-500 to-emerald-600 bg-size-[200%_auto] border border-emerald-200/50 dark:border-emerald-800/50 text-sm text-white font-medium mb-8 shadow-lg transition-colors animate-shimmer-background"
          >
            <span class="relative flex h-2 w-2">
              <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 dark:bg-yellow-400 opacity-75"
              />
              <span
                class="relative inline-flex rounded-full h-2 w-2 bg-yellow-700 dark:bg-yellow-600"
              />
            </span>
            {{ t("hero.badge") }}
          </div>

          <!-- Title -->
          <h1
            class="font-aeonik-pro-trial text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-900 dark:text-white leading-[1.08] mb-6 animate-fade-in-up"
            style="animation-delay: 100ms"
          >
            <span
              class="block bg-linear-to-r from-neutral-900 via-neutral-500 to-neutral-700 dark:from-neutral-50 dark:via-neutral-400 dark:to-neutral-100 bg-size-[200%_auto] bg-clip-text text-transparent transition-colors animate-shimmer-background"
              >{{ t("hero.title") }}</span
            >
            <span
              class="block bg-linear-to-r from-emerald-700 via-green-300 to-emerald-600 bg-size-[200%_auto] bg-clip-text text-transparent transition-colors animate-shimmer-background"
            >
              {{ t("hero.titleHighlight") }}
            </span>
          </h1>

          <!-- Subtitle -->
          <p
            class="text-lg sm:text-xl text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-2xl mx-auto mb-10 animate-fade-in-up"
            style="animation-delay: 200ms"
          >
            {{ t("hero.subtitle") }}
          </p>

          <!-- CTA Buttons -->
          <div
            class="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-16 animate-fade-in-up"
            style="animation-delay: 300ms"
          >
            <NuxtLink :to="localePath('/register?plan=free')">
              <UButton
                size="xl"
                class="bg-green-500 hover:bg-green-600 text-white shadow-xl shadow-green-500/20 font-semibold px-8"
              >
                {{ t("hero.cta.startFree") }}
                <template #trailing>
                  <UIcon name="i-lucide-arrow-right" class="h-5 w-5" />
                </template>
              </UButton>
            </NuxtLink>
            <NuxtLink :to="localePath('/docs')">
              <UButton size="xl" variant="outline" class="font-semibold px-8">
                {{ t("hero.cta.viewDocs") }}
                <template #trailing>
                  <UIcon name="i-lucide-book-open" class="h-5 w-5" />
                </template>
              </UButton>
            </NuxtLink>
          </div>

          <!-- Stats -->
          <div
            ref="statsRef"
            class="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-fade-in-up"
            style="animation-delay: 400ms"
          >
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="bg-white dark:bg-neutral-900 backdrop-blur-sm border border-neutral-200/50 dark:border-neutral-800/50 rounded-2xl p-5 text-center"
            >
              <div class="flex items-center justify-center gap-2 mb-2">
                <UIcon :name="stat.icon" class="h-4 w-4 text-green-500" />
              </div>
              <div
                class="text-2xl sm:text-3xl font-bold font-aeonik-pro-trial text-neutral-900 dark:text-white mb-1"
              >
                {{ stat.value }}
              </div>
              <div class="text-sm text-neutral-500 dark:text-neutral-400">
                {{ stat.label }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

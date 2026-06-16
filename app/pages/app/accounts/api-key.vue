<script setup lang="ts">
definePageMeta({
  layout: "auth",
  middleware: "auth",
});
useSeoMeta({
  title: "API Key",
  description: "Manage your account API key.",
  robots: "noindex, nofollow",
});

const { user } = useUserSession();
const config = useRuntimeConfig();
const toast = useAppToast();

const show = ref(false);
const apiKey = ref(user.value?.apiKey || "");
const webhookUrl = ref(`${config.public.PublicSiteUrl}/api/proxies/report`);
const copied = ref(false);

async function handleCopyApiKey() {
  try {
    await navigator.clipboard.writeText(apiKey.value);
    toast.success("API key copied to clipboard");
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Failed to copy API key to clipboard",
    );
  }
}

async function handleCopyWebhookUrl() {
  try {
    await navigator.clipboard.writeText(webhookUrl.value);
    toast.success("Webhook URL copied to clipboard");
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Failed to copy webhook URL to clipboard",
    );
  }
}

const formattedCode = ref(`# Test proxy mentah langsung (tahu host:port):
curl -X POST ${webhookUrl.value} \
  -H "x-api-key: ${apiKey.value}" -H "content-type: application/json" \
  -d '{"proxy":"1.2.3.4:8080","dead":true,"reason":"blocked"}'

# Via gateway (sticky session → resolve ke proxy yang dipakai):
curl -X POST ${webhookUrl.value} \
  -H "x-api-key: ${apiKey.value}" -H "content-type: application/json" \
  -d '{"poolUsername":"res_xxxx","session":"abc123","dead":true}'`);

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(formattedCode.value);

    toast.success("Curl command copied to clipboard");

    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "Failed to copy curl command to clipboard",
    );
  }
};
</script>

<template>
  <AppAccountLayout>
    <UPageCard
      title="API Key"
      description="Manage your account API key."
      variant="naked"
      class="mb-4"
    >
      <UPageCard
        variant="subtle"
        :ui="{ container: 'divide-y divide-default' }"
      >
        <div class="space-y-4">
          <div class="grid gap-2">
            <label for="api-key">API Key</label>
            <div class="flex items-center gap-2 w-full">
              <UInput
                v-model="apiKey"
                :type="show ? 'text' : 'password'"
                icon="material-symbols:key-outline"
                size="md"
                variant="outline"
                placeholder="Your API key"
                class="w-full"
                :ui="{ trailing: 'pe-1' }"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="show ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="show ? 'Hide API key' : 'Show API key'"
                    :aria-pressed="show"
                    aria-controls="api-key"
                    @click="show = !show"
                  />
                </template>
              </UInput>
              <UButton
                icon="material-symbols:content-copy-outline"
                variant="ghost"
                color="neutral"
                size="sm"
                @click="handleCopyApiKey"
                @click.stop
              />
            </div>
          </div>
          <div class="grid gap-2">
            <label for="webhook-url">Webhook URL</label>
            <div class="flex items-center gap-2 w-full">
              <UInput
                v-model="webhookUrl"
                icon="material-symbols:link"
                size="md"
                variant="outline"
                placeholder="Your webhook URL"
                class="w-full"
              />
              <UButton
                icon="material-symbols:content-copy-outline"
                variant="ghost"
                color="neutral"
                size="sm"
                @click="handleCopyWebhookUrl"
                @click.stop
              />
            </div>
          </div>

          <UAlert
            variant="soft"
            color="primary"
            class="rounded-lg border border-primary/20 p-4 text-sm text-muted"
          >
            <template #title>
              <p class="mb-1 font-medium text-info">Cara pakai webhook URL</p>
            </template>
            <template #description>
              <div class="curl-command">
                <div class="flex justify-between items-center mb-2">
                  <span class="text-sm font-mono text-muted">cURL Command</span>
                  <UButton
                    variant="outline"
                    color="neutral"
                    size="sm"
                    @click="copyToClipboard"
                  >
                    {{ copied ? "Copied!" : "Copy" }}
                  </UButton>
                </div>
                <pre
                  class="text-xs rounded-md p-4 bg-default text-default overflow-x-auto"
                >
<code>{{ formattedCode }}</code>
</pre>
              </div>
            </template>
          </UAlert>
        </div>
      </UPageCard>
    </UPageCard>
  </AppAccountLayout>
</template>

<style scoped>
.curl-command pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>

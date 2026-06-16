<script setup lang="ts">
import type { output } from "zod";
import type {
  FormSubmitEvent,
  FormErrorEvent,
  FormErrorWithId,
} from "@nuxt/ui";

const emits = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "onSuccess"): void;
  (e: "onClose"): void;
}>();
const props = withDefaults(
  defineProps<{
    open?: boolean;
  }>(),
  {
    open: false,
  },
);

const { isLoading, inviteUser } = useAdmin();
const toast = useAppToast();

const modalValue = useVModel(props, "open", emits, {
  defaultValue: false,
});

const state = reactive<InviteUserInput>({
  name: "",
  email: "",
  password: "",
  quotaBytes: 1024 * 1024 * 1024 * 10,
  quotaRequests: 1000,
  isActive: true,
  emailVerified: false,
});
const showPassword = ref(false);
const errorMessage = ref<FormErrorWithId[]>();

type Schema = output<typeof inviteUserSchema>;

const onSubmit = async (event: FormSubmitEvent<Schema>) => {
  try {
    const ok = await inviteUser(event.data);
    if (ok) {
      emits("onSuccess");
      toast.success("User invited successfully");
    }
  } catch (err) {
    console.error(err);
    toast.error(err instanceof Error ? err.message : "Failed to invite user");
  } finally {
    modalValue.value = false;
    resetForm();
  }
};
function setError(event: FormErrorEvent) {
  errorMessage.value = event.errors;
}
function resetForm() {
  state.name = "";
  state.email = "";
  state.password = "";
  state.quotaBytes = 1024 * 1024 * 1024 * 10;
  state.quotaRequests = 1000;
  state.isActive = true;
  state.emailVerified = false;
}
</script>

<template>
  <UModal
    v-model:open="modalValue"
    :close="{
      color: 'error',
      variant: 'outline',
      class: 'rounded-full text-error',
    }"
    scrollable
  >
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="font-semibold text-lg">Invite User</h3>
          <p class="text-sm text-muted mt-0.5">
            Invite a user to join your exchange.
          </p>
        </div>
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
        <UForm
          :schema="inviteUserSchema"
          :state="state"
          class="p-6 space-y-5 w-full"
          @submit="onSubmit"
          @error="setError"
        >
          <UFormField label="Name" name="name">
            <UInput
              v-model="state.name"
              type="text"
              name="name"
              placeholder="Enter name"
              autocomplete="name"
              icon="material-symbols:text-fields"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Email" name="email">
            <UInput
              v-model="state.email"
              type="email"
              name="email"
              placeholder="Enter email"
              autocomplete="email"
              icon="material-symbols:mail"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Password" name="password">
            <UInput
              v-model="state.password"
              :type="showPassword ? 'text' : 'password'"
              name="password"
              placeholder="Enter password"
              autocomplete="new-password"
              icon="material-symbols:lock"
              class="w-full"
              :disabled="isLoading"
            >
              <template #trailing>
                <UButton
                  type="button"
                  color="neutral"
                  variant="link"
                  size="sm"
                  :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  :aria-label="showPassword ? 'Hide password' : 'Show password'"
                  :aria-pressed="showPassword"
                  aria-controls="password"
                  @click.prevent="showPassword = !showPassword"
                />
              </template>
            </UInput>
          </UFormField>
          <UFormField label="Quota Bytes" name="quotaBytes">
            <UInput
              v-model.number="state.quotaBytes"
              type="number"
              name="quotaBytes"
              placeholder="Enter quota bytes"
              autocomplete="on"
              icon="material-symbols:money"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Quota Requests" name="quotaRequests">
            <UInput
              v-model.number="state.quotaRequests"
              type="number"
              name="quotaRequests"
              placeholder="Enter quota requests"
              autocomplete="on"
              icon="material-symbols:money"
              class="w-full"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Active" name="isActive">
            <USwitch
              v-model="state.isActive"
              label="Status Active"
              description="Determine the Active Status of the User Account"
              unchecked-icon="i-lucide-x"
              checked-icon="i-lucide-check"
              :disabled="isLoading"
            />
          </UFormField>
          <UFormField label="Email Verified" name="emailVerified">
            <USwitch
              v-model="state.emailVerified"
              label="Status Email Verified"
              description="Determine the Email Verification Status of the User Account"
              unchecked-icon="i-lucide-x"
              checked-icon="i-lucide-check"
              :disabled="isLoading"
            />
          </UFormField>
          <div class="flex items-center justify-end gap-2">
            <UButton
              type="button"
              label="Close"
              color="neutral"
              variant="outline"
              icon="material-symbols:close"
              size="md"
              :disabled="isLoading"
              @click="modalValue = false"
            />

            <UButton
              type="submit"
              color="primary"
              icon="material-symbols:add"
              size="md"
              class="text-white"
              :disabled="isLoading"
              :loading="isLoading"
            >
              {{ isLoading ? "Inviting..." : "Invite" }}
            </UButton>
          </div>
        </UForm>
      </div>
    </template>
  </UModal>
</template>

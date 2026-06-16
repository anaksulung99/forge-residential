import type { User, UserQuota, Role } from "@prisma/client";
import { useDebounceFn } from "@vueuse/core";

type UserWithRoles = User & {
  quota: UserQuota;
  role: Role;
};

interface ListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  has_more: boolean;
}
export interface FecthUserOption {
  status?: StatusActiveInput | "all";
  search?: string;
  orderBy?: string;
  role?: UserRole | "all";
}

export const useAdmin = () => {
  const toast = useToast();

  const filters = ref<FecthUserOption>({
    search: "",
    status: "all",
    role: "all",
    orderBy: "all",
  });

  const users = ref<UserWithRoles[]>([]);
  const user = ref<UserWithRoles | null>(null);
  const meta = ref<ListMeta>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    has_more: false,
  });

  const page = ref(1);
  const limit = ref(20);
  const isLoading = ref(false);

  const error = ref<string | null>(null);
  const selected = ref<Set<string>>(new Set());

  async function fetchUsers() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch("/api/user", {
        query: {
          page: page.value,
          limit: limit.value,
          ...(filters.value.search && { search: filters.value.search }),
          ...(filters.value.status !== "all" && {
            status: filters.value.status,
          }),
          ...(filters.value.role !== "all" && { role: filters.value.role }),
          ...(filters.value.orderBy !== "all" && {
            orderBy: filters.value.orderBy,
          }),
        },
      });
      if (!res.success) {
        users.value = [];
        meta.value = {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          has_more: false,
        };
        return;
      }

      users.value = res.data as unknown as UserWithRoles[];
      meta.value = res.meta;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Fail to fetch users";
    } finally {
      isLoading.value = false;
    }
  }

  const hasFilter = computed(
    () =>
      !!filters.value.search ||
      filters.value.status !== "all" ||
      filters.value.role !== "all" ||
      filters.value.orderBy !== "all",
  );

  const debouncedSearch = useDebounceFn(() => {
    page.value = 1;
    fetchUsers();
  }, 400);

  watch(() => filters.value.search, debouncedSearch);
  watch(
    [
      () => filters.value.status,
      () => filters.value.role,
      () => filters.value.orderBy,
    ],
    () => {
      page.value = 1;
      fetchUsers();
    },
  );
  watch(page, () => fetchUsers());

  const allSelected = computed(
    () =>
      users.value.length > 0 &&
      users.value.every((r) => selected.value.has(r.id)),
  );
  function toggleSelect(id: string) {
    const next = new Set(selected.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected.value = next;
  }
  function toggleAll() {
    selected.value = allSelected.value
      ? new Set()
      : new Set(users.value.map((r) => r.id));
  }
  watch(users, () => {
    selected.value = new Set();
  });

  async function getUser(userId: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch<ApiResponse<UserWithRoles>>(
        `/api/user/${userId}`,
      );
      if (!res.success) {
        user.value = null;
        return;
      }

      user.value = res.data as unknown as UserWithRoles;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Fail to fetch user";
    } finally {
      isLoading.value = false;
    }
  }
  async function inviteUser(data: InviteUserInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch("/api/user", {
        method: "POST",
        body: data,
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to invite user");
      }
      toast.add({
        title: "User invited successfully",
        description: res.message ?? "User invited successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });
      await fetchUsers();
      return true;
    } catch (err: any) {
      toast.add({
        title: "Failed to invite user",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function assignRole(id: string, data: AssignRoleInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/user/${id}/role-assign`, {
        method: "PATCH",
        body: data,
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to assign role");
      }
      toast.add({
        title: "Role assigned successfully",
        description: res.message ?? "Role assigned successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });
      await fetchUsers();
      return true;
    } catch (err: any) {
      toast.add({
        title: "Failed to assign role",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function setActiveStatus(id: string, data: SetActiveInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/user/${id}/status`, {
        method: "PATCH",
        body: data,
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to set active status");
      }
      toast.add({
        title: "Active status set successfully",
        description: res.message ?? "Active status set successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err: any) {
      toast.add({
        title: "Failed to set active status",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function deleteUser(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch<ApiResponse>(`/api/user/${id}`, {
        method: "DELETE",
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to delete user");
      }
      toast.add({
        title: "User deleted successfully",
        description: res.message ?? "User deleted successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to delete user",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function updateUser(id: string, data: UpdateUserInput) {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch<ApiResponse<User>>(`/api/user/${id}`, {
        method: "PATCH",
        body: data,
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to update user");
      }
      toast.add({
        title: "User updated successfully",
        description: res.message ?? "User updated successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to update user",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function bulkDeleteUsers() {
    const ids = [...selected.value];
    if (ids.length === 0) return;
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/user/bulk`, {
        method: "DELETE",
        body: {
          userIds: ids,
        },
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to bulk delete users");
      }
      toast.add({
        title: "Users deleted successfully",
        description: res.message ?? "Users deleted successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to bulk delete users",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
      selected.value.clear();
    }
  }
  async function cleanUpUsers() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/user/clean-up`, {
        method: "POST",
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to clean up users");
      }
      toast.add({
        title: "Users cleaned up successfully",
        description: res.message ?? "Users cleaned up successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to clean up users",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function cleanUpProxies() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/admin/proxy`, {
        method: "DELETE",
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to clean up users");
      }
      toast.add({
        title: "Proxies cleaned up successfully",
        description: res.message ?? "Proxies cleaned up successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to clean up proxies",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }
  async function cleanUpLogs() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await $fetch(`/api/admin`, {
        method: "DELETE",
      });
      if (!res.success) {
        throw new Error(res?.message ?? "Fail to clean up logs");
      }
      toast.add({
        title: "Logs cleaned up successfully",
        description: res.message ?? "Logs cleaned up successfully",
        color: "success",
        icon: "material-symbols:check-circle-outline",
      });

      await fetchUsers();

      return true;
    } catch (err) {
      toast.add({
        title: "Failed to clean up logs",
        description: err instanceof Error ? err.message : "Try again",
        color: "error",
        icon: "material-symbols:x-circle-outline",
      });
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  const resetFilter = async () => {
    filters.value = {
      search: "",
      status: "all",
      role: "all",
      orderBy: "all",
    };
    page.value = 1;
    await fetchUsers();
  };

  onMounted(fetchUsers);

  return {
    filters,
    users,
    user,
    meta,
    page,
    limit,
    isLoading,
    selected,
    error,
    // derived
    hasFilter,
    allSelected,
    // actions
    fetchUsers,
    toggleSelect,
    toggleAll,
    getUser,
    inviteUser,
    assignRole,
    setActiveStatus,
    deleteUser,
    updateUser,
    bulkDeleteUsers,
    cleanUpUsers,
    cleanUpProxies,
    cleanUpLogs,
    resetFilter,
  };
};

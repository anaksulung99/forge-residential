export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.path === "/") {
    return navigateTo("/login");
  }
});

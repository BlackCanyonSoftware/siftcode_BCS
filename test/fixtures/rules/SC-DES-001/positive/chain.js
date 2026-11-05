export function cancel(user) {
  return user.account.subscription.plan.cancel();
}

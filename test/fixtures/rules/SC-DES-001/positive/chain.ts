interface User {
  account: { subscription: { plan: { cancel(): void } } };
}

export function cancel(user: User): void {
  user.account.subscription.plan.cancel();
}

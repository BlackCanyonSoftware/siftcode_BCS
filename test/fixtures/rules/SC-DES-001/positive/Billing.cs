public class Billing
{
    public void Cancel(User user)
    {
        user.Account.Subscription.Plan.Cancel();
    }
}

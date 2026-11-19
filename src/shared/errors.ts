/** The user asked for something that cannot be done: bad arguments, missing path, bad config. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

/** Account transitions tear down the old editor before swapping credentials.
 * Its device-content cleanup must therefore finish before that transition. */
export async function signOutWithDeviceCleanup<T>(steps: {
  writes: Promise<void>;
  removeContent: () => Promise<void>;
  leave: () => Promise<T>;
}): Promise<T> {
  await steps.writes;
  await steps.removeContent();
  return steps.leave();
}

export interface ErasureObject {
  bucket_id: string;
  object_name: string;
}

export interface ErasureBackend {
  listObjects(userId: string): Promise<ErasureObject[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  acknowledge(userId: string, bucket: string, paths: string[]): Promise<void>;
  finish(userId: string): Promise<boolean>;
}

/** No acknowledgement before Storage has confirmed removal. A crash between
 * removal and acknowledgement repeats an idempotent delete on the next run. */
export async function processErasure(
  backend: ErasureBackend,
  userId: string,
  deadline: number,
  now: () => number = Date.now,
): Promise<boolean> {
  while (now() < deadline) {
    const objects = await backend.listObjects(userId);
    if (!objects.length) return backend.finish(userId);
    const bucket = objects[0].bucket_id;
    const paths = objects
      .filter((item) => item.bucket_id === bucket)
      .map((item) => item.object_name);
    await backend.remove(bucket, paths);
    await backend.acknowledge(userId, bucket, paths);
  }
  return false;
}

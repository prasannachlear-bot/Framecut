// Object-URL registry for asset blobs (session cache)

const urls = new Map<string, string>();

export function getAssetUrl(assetId: string, blob: Blob): string {
  let u = urls.get(assetId);
  if (!u) {
    u = URL.createObjectURL(blob);
    urls.set(assetId, u);
  }
  return u;
}

export function urlFor(assetId: string): string | undefined {
  return urls.get(assetId);
}

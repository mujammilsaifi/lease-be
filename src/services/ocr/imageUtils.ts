import { loadImage, createCanvas } from "@napi-rs/canvas";

/**
 * Rotates an image buffer by the specified angle (0, 90, 180, 270) using @napi-rs/canvas.
 * Optimized with center-point matrix rotation for maximum speed and memory efficiency.
 */
export async function rotateImage(imageBuffer: Buffer, angleDegrees: number): Promise<Buffer> {
  const normalizedAngle = ((angleDegrees % 360) + 360) % 360;
  if (normalizedAngle === 0) return imageBuffer;

  const img = await loadImage(imageBuffer);
  const isRotated90or270 = normalizedAngle === 90 || normalizedAngle === 270;
  const width = isRotated90or270 ? img.height : img.width;
  const height = isRotated90or270 ? img.width : img.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.translate(width / 2, height / 2);
  ctx.rotate((normalizedAngle * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvas.toBuffer("image/png");
}

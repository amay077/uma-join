import { from, IEnumerable } from "linq";
import { Rect, RGBA, Point } from "./types";

export function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise<Blob>(resolve => {
    canvas.toBlob(blob => {
      resolve(blob!)
    }, type);
  });
}

export function getPixelsFromRect(imageData: ImageData, rect: Rect): IEnumerable<IEnumerable<RGBA>> {
  const pixelStream = from(imageData.data).buffer(4).cast<RGBA>().buffer(imageData.width);
  const trimedPixels = pixelStream
    .skip(rect.y)
    .take(Math.min(rect.height, imageData.height - rect.y))
    .select(line => from(line).skip(rect.x).take(Math.min(rect.width, imageData.width - rect.x)));
  return trimedPixels;
}

export function getImageDataFromRect(imageData: ImageData, rect: Rect): ImageData {
  const pixelStream = from(imageData.data).buffer(4).cast<RGBA>().buffer(imageData.width);
  const trimedPixels = pixelStream
    .skip(rect.y)
    .take(Math.min(rect.height, imageData.height - rect.y))
    .select(line => from(line)
      .skip(rect.x)
      .take(Math.min(rect.width, imageData.width - rect.x))
      .selectMany(x => x).toArray())
    .selectMany(x => x);

  return new ImageData(new Uint8ClampedArray(trimedPixels.toArray()), rect.width, rect.height);
}

export function createImageData(image: HTMLImageElement, scale: number): ImageData {
  const canvas = document.createElement('canvas');

  canvas.width = image.width * scale;
  canvas.height = image.height * scale;

  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return imageData;
}

export async function loadImage(f: Blob, fixedImageWidthPx: number): Promise<{ imageData: ImageData, scaledImageData: ImageData, scale: number }> {
  return new Promise((r: any) => {
    const image = new Image();
    image.onload = async () => {
      const imageData = createImageData(image, 1);
      const scale = fixedImageWidthPx / image.width;
      const scaledImageData = createImageData(image, scale);
      r({ imageData, scaledImageData, scale });
    };
    image.src = URL.createObjectURL(f);
  });
}

export function drawImage(context: CanvasRenderingContext2D, imageData: ImageData, location: Point, srcRect: Rect)  {
  context.putImageData(imageData, location.x, location.y - srcRect.y, srcRect.x, srcRect.y, srcRect.width, srcRect.height);
};

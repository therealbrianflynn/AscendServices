import Image from "next/image";

const LOGO_SRC = "/brand/ascend-services-logo.jpg";
/** Intrinsic pixel size of the official file. */
const LOGO_INTRINSIC = { width: 2816, height: 1536 } as const;
/**
 * The official file is mostly white margin. This box is the arrow and
 * wordmark, with a little air so the mark is not clipped.
 */
const MARK = { x: 764, y: 96, width: 1288, height: 1296 } as const;

/**
 * Official Ascend Services lockup. Never recolored. Rendered from the
 * source file, cropped to the mark so the wordmark stays readable.
 */
export function BrandLogo({
  height,
  priority = false,
}: {
  height: number;
  priority?: boolean;
}) {
  const scale = height / MARK.height;
  const frameWidth = Math.round(MARK.width * scale);

  return (
    <span
      className="inline-block overflow-hidden align-middle"
      style={{ width: frameWidth, height }}
    >
      <Image
        src={LOGO_SRC}
        alt="Ascend Services"
        width={LOGO_INTRINSIC.width}
        height={LOGO_INTRINSIC.height}
        priority={priority}
        className="max-w-none"
        style={{
          width: LOGO_INTRINSIC.width * scale,
          height: LOGO_INTRINSIC.height * scale,
          marginLeft: -MARK.x * scale,
          marginTop: -MARK.y * scale,
        }}
      />
    </span>
  );
}

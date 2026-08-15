import Image from "next/image";

export function BrandMascot() {
  return <span className="brand-mark brand-mark-image" aria-hidden="true">
    <Image src="/brand-rabbit-3d-v2.webp" alt="" width={512} height={512} sizes="56px" priority />
  </span>;
}

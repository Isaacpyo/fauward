import Image from "next/image";
import Link from "next/link";

type BrandLogoVariant = "mark" | "wordmark" | "lockup";

type BrandLogoProps = {
  variant: BrandLogoVariant;
  href?: string;
  className?: string;
  priority?: boolean;
};

const logoMap: Record<
  BrandLogoVariant,
  { src: string; alt: string; width: number; height: number }
> = {
  mark: {
    src: "/brand/logo-mark.png",
    alt: "Fauward speed mark icon",
    width: 580,
    height: 560
  },
  wordmark: {
    src: "/brand/logo-wordmark.png",
    alt: "Fauward wordmark",
    width: 1230,
    height: 250
  },
  lockup: {
    src: "/brand/logo-lockup.png",
    alt: "Fauward speed mark primary lockup",
    width: 1400,
    height: 960
  }
};

export default function BrandLogo({ variant, href, className = "", priority = false }: BrandLogoProps) {
  const logo = logoMap[variant];

  const image = (
    <Image
      src={logo.src}
      alt={logo.alt}
      width={logo.width}
      height={logo.height}
      priority={priority}
      className={`h-auto w-full object-contain ${className}`.trim()}
    />
  );

  if (!href) {
    return image;
  }

  return (
    <Link href={href} aria-label="Fauward home">
      {image}
    </Link>
  );
}

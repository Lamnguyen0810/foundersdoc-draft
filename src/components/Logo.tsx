/**
 * The Founders Doc mark: the wordmark ruled above and below.
 *
 * This is the logo — not a fallback for one. An earlier version fetched a PNG
 * from the WordPress install and dropped back to plain text when it failed,
 * which is how a broken-image icon ended up in the nav. There is no image to
 * fail now, nothing to load, and it inherits `currentColor`, so it is correct
 * in light, in dark, and on the black footer without a second asset.
 *
 * `.fd-mark` comes from the confirmed Ver_30 design layer in globals.css.
 * Do not restyle it here.
 */
export default function Logo({ forceWhite = false }: { forceWhite?: boolean }) {
  return (
    <span className="fd-mark" style={forceWhite ? { color: "#fff" } : undefined}>
      Founders Doc
    </span>
  );
}

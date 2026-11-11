import React from "react";
import { WX_ICONS } from "./icons/icons";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("weather-control");

// The sky picture of the weather packages (moved from energy-field's icons, 2026-10-20 - heating-control
// shows it too). Since 2026-11-01 the weather's 3D set (icons/ - iot images/weather-icons/), each cropped
// to its drawing, so it stretches evenly in a widget; the same on the light and the dark theme.

/** The sky by the light and the clouds: sun / partly (sun and cloud) / cloud / dusk / night. */
export const skyOf = ({ radiation = 0, cloudPct = 0, isDay = true }) =>
  !isDay
    ? "night"
    : radiation < 40
      ? "dusk"
      : cloudPct > 75
        ? "cloud"
        : cloudPct > 30
          ? "partly"
          : "sun";

/** A sky picture's width / height. */
export const skyAspect = (props) => WX_ICONS[skyOf(props)].aspect;

/**
 * One of the weather's 3D icons (icons/icons.js): `height` - its height (the width by its own
 * proportions), or `size` - its width; `box` - fitted into a square of that side.
 */
export const WxIcon = ({ name, height, size, box, label }) => {
  const { src, aspect } = WX_ICONS[name];
  const h = box ? Math.min(box, box / aspect) : (height ?? size / aspect);
  return (
    <img
      src={src}
      width={Math.round(h * aspect * 10) / 10}
      height={Math.round(h * 10) / 10}
      alt={label ?? ""}
      aria-hidden={label ? undefined : "true"}
      draggable={false}
      style={{ display: "block", flex: "none", objectFit: "contain" }}
    />
  );
};

/**
 * The sky picture, cropped to its drawing: `height` - its height (the width by its own
 * proportions), or `size` - its width.
 */
export const SkyIcon = ({
  radiation = 0,
  cloudPct = 0,
  isDay = true,
  size = 96,
  height,
}) => {
  const sky = skyOf({ radiation, cloudPct, isDay });
  return (
    <WxIcon
      name={sky}
      height={height}
      size={size}
      label={t("Sky: {{sky}}", { sky })}
    />
  );
};

export default SkyIcon;

import React from "react";
import { WX_ICONS } from "./icons/icons";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("weather-control");

// The Weather component's Dashboard avatar (dashboardRegistry.js `avatars`, 2026-10-16): a static
// picture - the sun behind a cloud and a thermometer from the weather's 3D set (icons/, 2026-11-01) -
// on a transparent background, filling the card's picture block (scaled with it, centred).
const WeatherAvatar = () => (
  <div
    role="img"
    aria-label={t("Weather")}
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6%",
      padding: "6% 4%",
    }}
  >
    <img
      src={WX_ICONS.partly.src}
      alt=""
      style={{ height: "100%", maxWidth: "62%", objectFit: "contain" }}
    />
    <img
      src={WX_ICONS.thermometer.src}
      alt=""
      style={{ height: "82%", objectFit: "contain" }}
    />
  </div>
);

export default WeatherAvatar;

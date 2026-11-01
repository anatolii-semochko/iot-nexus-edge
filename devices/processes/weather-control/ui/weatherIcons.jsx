import React from "react";
import { WxIcon } from "./SkyIcon";

// The weather's small pictures (the card picture's, 2026-10-25; shared with the scene 2026-10-30): a
// drop (the humidity), a cloud with rain (grey dry, blue wet), a thermometer - since 2026-11-01 the
// weather's 3D set (icons/), each fitted into a square of `size`.

const ICON = 34;

export const DropIcon = ({ size = ICON }) => <WxIcon name="drop" box={size} />;

export const RainIcon = ({ size = ICON, wet = false }) => (
  <WxIcon name={wet ? "rain" : "rain-dry"} box={size} />
);

export const ThermoIcon = ({ size = ICON }) => (
  <WxIcon name="thermometer" box={size} />
);

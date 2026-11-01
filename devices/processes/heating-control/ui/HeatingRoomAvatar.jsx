import React from "react";
import KeyValue from "src/components/KeyValue";
import { FanCoilIcon } from "./heatIcons";
import { fmt, useHeatingData } from "./useHeatingData";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("heating-control");

// One room's Dashboard card picture (heatingControl.room, the user 2026-11-01 - the hall's heaters were
// a tiny copy of the whole component): the fan coil large (its room, temperature, humidity, fan and
// gauge), under it the figures - the setpoint, the heat it gives now, the heat meter today. The
// controls (the valve, the setpoint + / -) stay in the popup.
// Drawn at its natural size - an unframed card scales it to the block's edges.

const WIDTH = 330;
const TONE = { heat: "#d49a00", cold: "#1c7ed6" };

const Figure = ({ label, hint, children }) => (
  <div title={hint} style={{ lineHeight: 1.15, textAlign: "center" }}>
    <div className="text-body-secondary" style={{ fontSize: "0.8rem" }}>
      {label}
    </div>
    <div style={{ fontSize: "1.3rem" }}>{children}</div>
  </div>
);

const HeatingRoomAvatar = ({ process, params = {} }) => {
  const { m } = useHeatingData(process);
  const coil = (m.consumers ?? []).find((c) => c.nodeId === params.nodeId);
  if (!coil) return null;
  const cooling = m.mode === "cooling";
  return (
    <div
      style={{
        width: WIDTH,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 4,
        whiteSpace: "nowrap",
      }}
    >
      <FanCoilIcon coil={coil} mode={m.mode} width={WIDTH} />
      <div
        className="d-flex justify-content-between"
        style={{ width: "100%", gap: 12 }}
      >
        <Figure
          label={t("Setpoint")}
          hint={t("The room's target temperature ({{v0}})", {
            v0: cooling ? "cooling" : "heating",
          })}
        >
          <KeyValue value={fmt(coil.setpointC)} unit="°C" />
        </Figure>
        <Figure
          label={coil.working ? t("Working") : t("Idle")}
          hint={t("The fan coil now: {{v0}}", {
            v0: coil.working
              ? `${cooling ? "cooling" : "heating"} - its fan turns`
              : "idle - the room is at its setpoint",
          })}
        >
          <KeyValue
            value={fmt(Math.abs(coil.heatKw))}
            unit="kW"
            color={coil.working ? (cooling ? TONE.cold : TONE.heat) : undefined}
          />
        </Figure>
        <Figure
          label={t("Heat meter today")}
          hint={t(
            "The room's heat meter - the {{v0}} its fan coil gave today",
            {
              v0: cooling ? "cold" : "heat",
            },
          )}
        >
          <KeyValue value={fmt(coil.todayKwh, 1)} unit="kWh" />
        </Figure>
      </div>
    </div>
  );
};

export default HeatingRoomAvatar;

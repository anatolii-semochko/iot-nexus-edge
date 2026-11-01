import React from "react";
import KeyValue from "src/components/KeyValue";
import { MeterPicture, useMeter } from "./EnergyMeter";
import { fmt } from "./useFieldData";
import { packageT } from "src/i18n";
// the package's words (its own locales/, then the core's)
const t = packageT("energy-field");

// One meter's Dashboard card picture (energyField.meter, the user 2026-11-01 - as the other
// avatars): the big meter on the left, its figures on the right - the power now, today's kWh and
// today's cost. The chart stays in the popup (the full component).
// Drawn at its natural size - an unframed card scales it to the block's edges.

const PICTURE_HEIGHT = 150;

const Figure = ({ label, hint, children, big }) => (
  <div title={hint} style={{ lineHeight: 1.15 }}>
    {label && <div className="small text-body-secondary">{label}</div>}
    <div style={{ fontSize: big ? "2rem" : "1.35rem" }}>{children}</div>
  </div>
);

const EnergyMeterAvatar = ({ process, params = {} }) => {
  const meter = useMeter(process, params.nodeId);
  if (!meter) return null;
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "4px 8px",
        whiteSpace: "nowrap",
      }}
    >
      <MeterPicture kw={meter.kw} height={PICTURE_HEIGHT} />
      <div className="d-flex flex-column" style={{ gap: 10 }}>
        <Figure big hint={t("The power the room takes now")}>
          <KeyValue value={fmt(meter.kw, 1)} unit="kW" />
        </Figure>
        <Figure label={t("Today")} hint={t("Today's consumption")}>
          <KeyValue value={fmt(meter.todayKwh, 1)} unit="kWh" />
        </Figure>
        <Figure
          label={t("Cost today")}
          hint={t("Today's consumption at each slot's purchase price")}
        >
          <KeyValue value={fmt(meter.todayEur, 2)} unit="€" />
        </Figure>
      </div>
    </div>
  );
};

export default EnergyMeterAvatar;
